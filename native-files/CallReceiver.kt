package com.hibiz.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import com.facebook.react.bridge.Arguments

class CallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {

        try {

            when (intent.action) {

                // 📞 INCOMING CALL STATES
                TelephonyManager.ACTION_PHONE_STATE_CHANGED -> {

                    val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
                    val rawNumber =
                        intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

                    val number = sanitizeNumber(rawNumber)

                    Log.d("CallReceiver", "Incoming State: $state | Number: $number")

                    sendToReact(state, number)

                    // 🟢 Show overlay when ringing or call connected
                    if (
                        state == TelephonyManager.EXTRA_STATE_RINGING ||
                        state == TelephonyManager.EXTRA_STATE_OFFHOOK
                    ) {
                        startOverlay(context, number)
                    }

                    // 🔴 Remove overlay when call ends
                    if (state == TelephonyManager.EXTRA_STATE_IDLE) {
                        stopOverlay(context)
                    }
                }

                // 📤 OUTGOING CALL DETECT
                Intent.ACTION_NEW_OUTGOING_CALL -> {

                    val rawNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER)
                    val number = sanitizeNumber(rawNumber)

                    Log.d("CallReceiver", "Outgoing Call: $number")

                    sendToReact("OUTGOING", number)

                    // 🟢 Show overlay immediately for outgoing
                    startOverlay(context, number)
                }
            }

        } catch (e: Exception) {
            Log.e("CallReceiver", "Error processing call state", e)
        }
    }

    // -------------------------
    // Helpers
    // -------------------------

    private fun sanitizeNumber(number: String?): String {
        if (number.isNullOrEmpty()) return ""

        // Remove spaces, +91, -, etc.
        return number
            .replace("\\s".toRegex(), "")
            .replace("-", "")
            .replace("+91", "")
            .takeLast(10)
    }

    private fun sendToReact(state: String?, number: String) {
        val params = Arguments.createMap().apply {
            putString("state", state ?: "")
            putString("phoneNumber", number)
        }

        CallTrackerModule.sendEvent("onCallStateChange", params)
    }

    private fun startOverlay(context: Context, number: String) {
        val serviceIntent = Intent(context, OverlayService::class.java).apply {
            putExtra("phoneNumber", number)
        }
        context.startService(serviceIntent)
    }

    private fun stopOverlay(context: Context) {
        val serviceIntent = Intent(context, OverlayService::class.java)
        context.stopService(serviceIntent)
    }
}
