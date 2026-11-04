package com.example.wifiaudiostreamer

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var projectionManager: MediaProjectionManager
    private val captureRequest = 1001
    private val permissionRequest = 1002

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        projectionManager =
            getSystemService(MEDIA_PROJECTION_SERVICE)
                    as MediaProjectionManager

        val startButton = Button(this).apply {
            text = "START AUDIO STREAMING"
            setOnClickListener {
                checkPermissionAndStart()
            }
        }

        val stopButton = Button(this).apply {
            text = "STOP AUDIO STREAMING"
            setOnClickListener {
                stopService(
                    Intent(this@MainActivity, AudioStreamService::class.java)
                )
                Toast.makeText(
                    this@MainActivity,
                    "Streaming stopped",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 80, 40, 40)
            addView(startButton)
            addView(stopButton)
        }

        setContentView(layout)
    }

    private fun checkPermissionAndStart() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(Manifest.permission.RECORD_AUDIO),
                permissionRequest
            )
        } else {
            requestCaptureConsent()
        }
    }

    private fun requestCaptureConsent() {
        startActivityForResult(
            projectionManager.createScreenCaptureIntent(),
            captureRequest
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(
            requestCode, permissions, grantResults
        )

        if (requestCode == permissionRequest) {
            if (grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            ) {
                requestCaptureConsent()
            } else {
                Toast.makeText(
                    this,
                    "Audio permission is required",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    @Deprecated("Using activity result for MediaProjection consent")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == captureRequest &&
            resultCode == RESULT_OK &&
            data != null
        ) {
            val serviceIntent = Intent(
                this,
                AudioStreamService::class.java
            ).apply {
                putExtra("resultCode", resultCode)
                putExtra("projectionData", data)
            }

            startForegroundService(serviceIntent)
        }
    }
}