package com.hibiz.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.ContactsContract
import android.util.Log
import android.view.*
import android.widget.Button
import android.widget.TextView
import android.widget.RelativeLayout
import androidx.core.app.NotificationCompat

class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private val CHANNEL_ID = "overlay_channel"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Call Assistant Active")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        startForeground(1, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val phoneNumber = intent?.getStringExtra("phoneNumber") ?: ""
        val name = intent?.getStringExtra("name")
        val product = intent?.getStringExtra("product")
        val status = intent?.getStringExtra("status")
        val leadNo = intent?.getStringExtra("leadNo")

        showOverlayUI(phoneNumber, name, product, status, leadNo)
        // Ensure service doesn't die when the call state changes to IDLE
        return START_STICKY 
    }

    private fun showOverlayUI(phoneNumber: String, dbName: String?, product: String?, status: String?, leadNo: String?) {
        try {
            windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            
            overlayView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }

            val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
            overlayView = inflater.inflate(R.layout.overlay_layout, null)

            val rootContainer = overlayView?.findViewById<RelativeLayout>(R.id.rootContainer)
            val txtName = overlayView?.findViewById<TextView>(R.id.txtName)
            val txtProduct = overlayView?.findViewById<TextView>(R.id.txtProduct)
            val txtStatus = overlayView?.findViewById<TextView>(R.id.txtStatus)
            val txtLeadNo = overlayView?.findViewById<TextView>(R.id.txtLeadNo)
            val btnX = overlayView?.findViewById<TextView>(R.id.btnCloseX)
            
            val btnPrimary = overlayView?.findViewById<Button>(R.id.btnPrimary)
            val btnSecondary = overlayView?.findViewById<Button>(R.id.btnSecondary)
            val btnIgnore = overlayView?.findViewById<Button>(R.id.btnIgnore)

            btnX?.setOnClickListener { stopSelf() }
            btnIgnore?.setOnClickListener { stopSelf() }

            val phoneContactName = if (isNumberInContacts(phoneNumber)) getContactName(phoneNumber) else null
            val cleanDbName = if (dbName.isNullOrBlank() || dbName == "null") null else dbName

            when {
                // CASE 1: Found in MongoDB (GREEN)
                cleanDbName != null -> {
                    rootContainer?.setBackgroundColor(Color.parseColor("#C8E6C9")) // Light Green
                    txtName?.text = cleanDbName
                    txtProduct?.text = product ?: "Lead"
                    txtStatus?.text = "Status: ${status ?: "Live"}"
                    txtLeadNo?.text = "ID: ${leadNo ?: "-"}"

                    btnPrimary?.text = "Add Activity"
                    btnSecondary?.visibility = View.GONE
                    
                    btnPrimary?.setOnClickListener { 
                        OverlayModule.sendOverlayAction("OPEN_ACTIVITY_MODAL", phoneNumber, cleanDbName ?: "")
                        stopSelf() 
                    }
                }

                // CASE 2: Found in Phone Contacts (ORANGE)
                    phoneContactName != null -> {
                    rootContainer?.setBackgroundColor(Color.parseColor("#f6efac"))
                    txtName?.text = phoneContactName
                    txtProduct?.text = "Choose product"
                    txtStatus?.text = "Engaged"
                    txtLeadNo?.text = "Generted"

                    btnPrimary?.text = "New Lead"
                    btnSecondary?.visibility = View.GONE
                    
                    btnPrimary?.setOnClickListener { 
                        OverlayModule.sendOverlayAction("OPEN_LEAD_MODAL", phoneNumber, phoneContactName)
                        stopSelf() 
                    }
                }

                // CASE 3: Unknown Number (YELLOW)
                else -> {
                    rootContainer?.setBackgroundColor(Color.parseColor("#FFF9C4")) // Light Yellow
                    txtName?.text = "New Number"
                    txtProduct?.text = phoneNumber
                    txtStatus?.text = "Engaged"
                    txtLeadNo?.text = "Generted"

                    btnPrimary?.text = "Spam"
                    btnPrimary?.backgroundTintList = android.content.res.ColorStateList.valueOf(Color.RED)
                    
                    btnSecondary?.text = "New Lead"
                    btnSecondary?.visibility = View.VISIBLE
                    
                    btnPrimary?.setOnClickListener { 
                        OverlayModule.sendOverlayAction("BLOCK_SPAM", phoneNumber)
                        stopSelf() 
                    }
                    btnSecondary?.setOnClickListener { 
                        OverlayModule.sendOverlayAction("OPEN_LEAD_MODAL", phoneNumber, "New Client") 
                        stopSelf() 
                    }
                }
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.CENTER
            windowManager?.addView(overlayView, params)

        } catch (e: Exception) { Log.e("OverlayService", "UI Error", e) }
    }

    private fun isNumberInContacts(number: String): Boolean {
        if (number.isEmpty()) return false
        val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon().appendPath(number).build()
        val cursor = try { contentResolver.query(uri, null, null, null, null) } catch (e: Exception) { null }
        val exists = (cursor?.count ?: 0) > 0
        cursor?.close()
        return exists
    }

    private fun getContactName(number: String): String {
        val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon().appendPath(number).build()
        val cursor = contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)
        var name = "Contact"
        if (cursor?.moveToFirst() == true) { name = cursor.getString(0) }
        cursor?.close()
        return name
    }

    override fun onDestroy() {
        super.onDestroy()
        overlayView?.let { try { windowManager?.removeView(it) } catch (_: Exception) {} }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Lead Overlay", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
