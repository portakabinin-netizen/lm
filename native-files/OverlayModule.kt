package com.hibiz.app
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private var instance: OverlayModule? = null

        // Unified helper: Always sends 3 params to the bridge
        fun sendOverlayAction(action: String, phoneNumber: String, name: String? = "") {
            instance?.sendEventToJS("onOverlayAction", action, phoneNumber, name ?: "")
        }

        fun openActivityScreen(number: String) {
            instance?.sendEventToJS("onOverlayAction", "OPEN_ACTIVITY_MODAL", number, "")
        }

        fun openCreateLeadScreen(number: String) {
            instance?.sendEventToJS("onOverlayAction", "OPEN_CREATE_LEAD_MODAL", number, "")
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = "OverlayModule"

    @ReactMethod
    fun addListener(eventName: String?) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // ... (keep checkPermission, requestPermission, showOverlay, hideOverlay as they were)

    private fun sendEventToJS(event: String, action: String, phoneNumber: String, name: String) {
    try {
        val params = Arguments.createMap().apply {
            putString("action", action)
            putString("phoneNumber", phoneNumber) 
            putString("name", name)                
        }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    } catch (e: Exception) {
        Log.e("OverlayModule", "Error", e)
    }
}
}
