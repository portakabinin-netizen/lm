package com.hibiz.app

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CallLog
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class CallTrackerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "CallTrackerModule"

    companion object {
        private var mReactContext: ReactApplicationContext? = null
        
        fun sendEvent(eventName: String, params: WritableMap?) {
            mReactContext?.let {
                if (it.hasActiveCatalystInstance()) {
                    it.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        ?.emit(eventName, params)
                }
            }
        }
    }

    init {
        mReactContext = reactApplicationContext
    }

    @ReactMethod
    fun ping(promise: Promise) {
        promise.resolve("PONG")
    }

    @ReactMethod
    fun getDeviceCallLogs(promise: Promise) {
        try {
            // 🚀 NATIVE PERMISSION CHECK
            val hasLogPerm = ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
            if (!hasLogPerm) {
                promise.reject("PERMISSION_DENIED", "READ_CALL_LOG not granted")
                return
            }

            val callList = Arguments.createArray()
            val uris = arrayOf(
                CallLog.Calls.CONTENT_URI,
                Uri.parse("content://call_log/calls")
            )

            var success = false
            for (targetUri in uris) {
                if (success) break
                val cursor = reactApplicationContext.contentResolver.query(
                    targetUri, null, null, null, "${CallLog.Calls.DATE} DESC"
                )

                cursor?.use {
                    if (it.count > 0 && it.moveToFirst()) {
                        success = true
                        val numIdx = it.getColumnIndex(CallLog.Calls.NUMBER)
                        val typeIdx = it.getColumnIndex(CallLog.Calls.TYPE)
                        val dateIdx = it.getColumnIndex(CallLog.Calls.DATE)
                        val durIdx = it.getColumnIndex(CallLog.Calls.DURATION)
                        val nameIdx = it.getColumnIndex(CallLog.Calls.CACHED_NAME)

                        var count = 0
                        do {
                            val map = Arguments.createMap()
                            val number = if (numIdx != -1) it.getString(numIdx) else ""
                            val cachedName = if (nameIdx != -1) it.getString(nameIdx) else ""
                            val timestamp = if (dateIdx != -1) it.getLong(dateIdx).toString() else "0"
                            val duration = if (durIdx != -1) it.getString(durIdx) else "0"
                            val type = if (typeIdx != -1) it.getInt(typeIdx) else -1

                            map.putString("phoneNumber", number ?: "")
                            map.putString("sender_name", if (cachedName.isNullOrBlank()) "Unknown" else cachedName)
                            map.putString("duration", duration ?: "0")
                            map.putString("timestamp", timestamp)
                            map.putString("direction", when (type) {
                                CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                                CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                                CallLog.Calls.MISSED_TYPE -> "MISSED"
                                CallLog.Calls.REJECTED_TYPE -> "REJECTED"
                                else -> "OTHER"
                            })
                            callList.pushMap(map)
                            count++
                        } while (it.moveToNext() && count < 60)
                    }
                }
            }

            if (!success) {
                 // 🚀 BRIDGE TEST fall-back
                 val testMap = Arguments.createMap()
                 testMap.putString("phoneNumber", "System-Test-Success")
                 testMap.putString("sender_name", "BRIDGE TEST PASSED")
                 testMap.putString("duration", "0")
                 testMap.putString("timestamp", System.currentTimeMillis().toString())
                 testMap.putString("direction", "INCOMING")
                 callList.pushMap(testMap)
            }
            promise.resolve(callList)
        } catch (e: Exception) {
            promise.reject("NATIVE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun showLeadToast(message: String, title: String) {
        UiThreadUtil.runOnUiThread {
            Toast.makeText(reactApplicationContext, "$title: $message", Toast.LENGTH_LONG).show()
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
