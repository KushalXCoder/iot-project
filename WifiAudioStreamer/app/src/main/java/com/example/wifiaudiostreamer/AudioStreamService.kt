package com.example.wifiaudiostreamer

import android.content.pm.PackageManager
import android.app.*
import android.content.Intent
import android.media.*
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread

class AudioStreamService : Service() {

    private var running = false
    private var audioRecord: AudioRecord? = null
    private var socket: DatagramSocket? = null
    private var projection: MediaProjection? = null

    private val esp32IP = "10.164.49.254"
    private val esp32Port = 50005

    override fun onBind(intent: Intent?) = null

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {

        createNotificationChannel()

        val notification = Notification.Builder(this, "audio_channel")
            .setContentTitle("Wi-Fi Audio Streamer")
            .setContentText("Streaming phone audio to ESP32")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .build()

        startForeground(1, notification)

        val resultCode = intent?.getIntExtra("resultCode", 0) ?: 0
        val projectionData =
            if (Build.VERSION.SDK_INT >= 33) {
                intent?.getParcelableExtra(
                    "projectionData",
                    Intent::class.java
                )
            } else {
                @Suppress("DEPRECATION")
                intent?.getParcelableExtra("projectionData")
            }

        if (projectionData == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        val manager =
            getSystemService(MEDIA_PROJECTION_SERVICE)
                    as MediaProjectionManager

        projection = manager.getMediaProjection(
            resultCode,
            projectionData
        )

        startStreaming()

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                "audio_channel",
                "Audio Streaming",
                NotificationManager.IMPORTANCE_LOW
            )

            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun startStreaming() {
        if (running) return

        // Check microphone/audio capture permission
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            android.util.Log.e("WiFiAudio", "RECORD_AUDIO permission not granted")
            stopSelf()
            return
        }

        try {
            val sampleRate = 44100

            val format = AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                .build()

            val config = AudioPlaybackCaptureConfiguration.Builder(
                projection ?: return
            )
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .build()

            val minBuffer = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_STEREO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            if (minBuffer <= 0) {
                android.util.Log.e("WiFiAudio", "Invalid audio buffer size: $minBuffer")
                stopSelf()
                return
            }

            val bufferSize = maxOf(minBuffer * 2, 8192)

            audioRecord = AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(bufferSize)
                .setAudioPlaybackCaptureConfig(config)
                .build()

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                android.util.Log.e("WiFiAudio", "AudioRecord initialization failed")
                stopSelf()
                return
            }

            audioRecord?.startRecording()
            running = true

            thread {
                try {
                    socket = DatagramSocket()
                    val address = InetAddress.getByName(esp32IP)
                    val buffer = ByteArray(1200)

                    while (running) {
                        val count = audioRecord?.read(
                            buffer, 0, buffer.size
                        ) ?: -1

                        if (count > 0 && count % 4 == 0) {
                            val packet = DatagramPacket(
                                buffer, count, address, esp32Port
                            )
                            socket?.send(packet)
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.e("WiFiAudio", "Streaming error", e)
                }
            }

        } catch (e: SecurityException) {
            android.util.Log.e("WiFiAudio", "Audio permission error", e)
            stopSelf()
        } catch (e: Exception) {
            android.util.Log.e("WiFiAudio", "Audio initialization error", e)
            stopSelf()
        }
    }

    override fun onDestroy() {
        running = false

        try {
            audioRecord?.stop()
        } catch (_: Exception) {}

        audioRecord?.release()
        audioRecord = null

        socket?.close()
        projection?.stop()

        super.onDestroy()
    }
}