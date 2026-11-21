package com.cashtap

import android.content.ActivityNotFoundException
import android.content.Intent
import android.nfc.tech.IsoDep
import android.os.SystemClock
import android.provider.Settings
import com.cashtap.emv.ApduExchange
import com.cashtap.emv.CardReadResult
import com.cashtap.emv.EmvError
import com.cashtap.emv.EmvException
import com.cashtap.emv.EmvOrchestrator
import com.cashtap.emv.LinkLostException
import com.cashtap.emv.TerminalData
import com.cashtap.nfc.IsoDepTransceiver
import com.cashtap.nfc.NfcSessionManager
import com.cashtap.nfc.NfcStateMonitor
import com.cashtap.nfc.NfcStatus
import com.cashtap.nfc.NfcUnavailableException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Ponte do Turbo Module: operações atômicas e eventos, sem política de fluxo
 * (timeout, retentativa e mensagens ficam na máquina de estados do TS).
 */
class CashtapModule(reactContext: ReactApplicationContext) :
  NativeCashtapSpec(reactContext) {

  /** Toda troca de APDU roda aqui, nunca na main thread. */
  private val ioExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "CashTap-IsoDep")
  }
  private val reading = AtomicBoolean(false)
  private val cancelRequested = AtomicBoolean(false)

  private val nfcStateMonitor = NfcStateMonitor(reactContext) { status ->
    emitOnNfcStatusChange(status.name)
  }

  private val session = NfcSessionManager(reactContext) {
    emitOnTagDetected(Arguments.createMap().apply { putDouble("detectedAt", SystemClock.elapsedRealtime().toDouble()) })
  }

  init {
    nfcStateMonitor.start()
  }

  override fun getNfcStatus(promise: Promise) {
    promise.resolve(NfcStatus.of(reactApplicationContext).name)
  }

  override fun startReaderMode(promise: Promise) {
    try {
      session.start()
      promise.resolve(null)
    } catch (e: NfcUnavailableException) {
      promise.reject(e.code, e.message)
    }
  }

  override fun stopReaderMode(promise: Promise) {
    session.stop()
    promise.resolve(null)
  }

  override fun readCard(amountCents: Double, currencyCode: String, diagnostics: Boolean, promise: Promise) {
    if (!reading.compareAndSet(false, true)) {
      promise.reject(EmvError.UNKNOWN.name, "leitura já em andamento")
      return
    }
    cancelRequested.set(false)
    val tag = session.takeTag()
    ioExecutor.execute {
      try {
        promise.resolve(read(tag, amountCents.toLong(), currencyCode, diagnostics))
      } catch (e: EmvException) {
        AndroidLogger.debug("leitura falhou: ${e.error} (${e.detail})")
        promise.reject(e.error.name, e.detail)
      } catch (e: Exception) {
        AndroidLogger.warn("falha inesperada na leitura: ${e.javaClass.simpleName}")
        promise.reject(EmvError.UNKNOWN.name, e.javaClass.simpleName)
      } finally {
        reading.set(false)
      }
    }
  }

  override fun cancelRead() {
    cancelRequested.set(true)
  }

  private fun read(tag: android.nfc.Tag?, amountCents: Long, currencyCode: String, diagnostics: Boolean): String {
    tag ?: throw EmvException(EmvError.CARD_REMOVED, "nenhum cartão no campo")
    // E2-H3: tag sem ISO-DEP não é cartão de pagamento suportado.
    val isoDep = IsoDep.get(tag) ?: throw EmvException(EmvError.UNSUPPORTED_BRAND, "tag sem suporte a ISO-DEP")
    val transceiver = IsoDepTransceiver(isoDep)
    try {
      try {
        transceiver.connect()
      } catch (e: LinkLostException) {
        throw EmvException(EmvError.CARD_REMOVED, "cartão saiu antes da conexão", e)
      }
      val terminal = try {
        TerminalData(amountCents = amountCents, currencyCode = currencyCode.padStart(4, '0'))
      } catch (e: IllegalArgumentException) {
        throw EmvException(EmvError.UNKNOWN, "parâmetros de terminal inválidos: ${e.message}")
      }
      val result = EmvOrchestrator(
        transceiver = transceiver,
        terminal = terminal,
        logger = AndroidLogger,
        diagnostics = if (diagnostics) ::emitDiagnostic else null,
        isCancelled = cancelRequested::get,
      ).read()
      return result.toJson()
    } finally {
      transceiver.close() // RN-11
    }
  }

  private fun emitDiagnostic(exchange: ApduExchange) {
    emitOnDiagnostic(
      Arguments.createMap().apply {
        putString("step", exchange.step.name)
        putString("command", exchange.command)
        putString("response", exchange.response)
        putString("sw", exchange.sw)
        putDouble("durationMs", exchange.durationMs)
      }
    )
  }

  /** RN-02: leva o operador à tela de NFC; cai para a de conexões se o aparelho não tiver uma. */
  override fun openNfcSettings() {
    val activity = reactApplicationContext.currentActivity
    val launch = { action: String ->
      val intent = Intent(action)
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
    try {
      launch(Settings.ACTION_NFC_SETTINGS)
    } catch (_: ActivityNotFoundException) {
      try {
        launch(Settings.ACTION_WIRELESS_SETTINGS)
      } catch (e: RuntimeException) {
        AndroidLogger.warn("nenhuma tela de configurações de NFC disponível: ${e.javaClass.simpleName}")
      }
    } catch (e: RuntimeException) {
      // Alguns fabricantes protegem a tela com SecurityException; nunca derrubar o app por isso.
      AndroidLogger.warn("não foi possível abrir as configurações de NFC: ${e.javaClass.simpleName}")
    }
  }

  override fun invalidate() {
    cancelRequested.set(true)
    session.destroy()
    nfcStateMonitor.stop()
    ioExecutor.shutdownNow()
    super.invalidate()
  }

  companion object {
    const val NAME = NativeCashtapSpec.NAME
  }
}

/** Único ponto em que o PAN completo deixa o Kotlin (RN-24). */
private fun CardReadResult.toJson(): String = JSONObject().apply {
  put("pan", pan)
  put("panMasked", panMasked)
  put("expiry", expiry)
  put("brand", brand.wireName)
  put("aid", aid)
  applicationLabel?.let { put("applicationLabel", it) }
  panSequenceNumber?.let { put("panSequenceNumber", it) }
  put("cryptogramPresent", cryptogramPresent)
  put("stepDurationsMs", JSONObject().apply { stepDurationsMs.forEach { (step, ms) -> put(step.name, ms) } })
}.toString()
