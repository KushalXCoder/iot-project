import socket
import logging

from config import ESP32_AUDIO_IP, ESP32_AUDIO_PORT
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("haven.audio")
router = APIRouter()


MAX_UDP_PACKET = 1200  # Must match the ESP32 receiver buffer size.
udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)


@router.get("/audio/status")
def audio_status():
    return {
        "configured": bool(ESP32_AUDIO_IP),
        "target_ip": ESP32_AUDIO_IP or None,
        "target_port": ESP32_AUDIO_PORT,
        "max_packet_bytes": MAX_UDP_PACKET,
        "format": "signed 16-bit little-endian PCM, 44100 Hz, stereo"
    }


@router.websocket("/audio/stream")
async def audio_stream(websocket: WebSocket):
    await websocket.accept()

    if not ESP32_AUDIO_IP:
        await websocket.send_json({
            "type": "error",
            "message": "ESP32_AUDIO_IP is not configured in backend/.env"
        })
        await websocket.close(code=1011)
        return

    target = (ESP32_AUDIO_IP, ESP32_AUDIO_PORT)
    packets_sent = 0
    bytes_sent = 0

    try:
        await websocket.send_json({
            "type": "ready",
            "target": f"{ESP32_AUDIO_IP}:{ESP32_AUDIO_PORT}",
            "format": "pcm_s16le_stereo_44100"
        })

        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            payload = message.get("bytes")
            if payload is None:
                # Text messages are reserved for control/status messages.
                text = message.get("text")
                if text == "stop":
                    break
                continue

            # ESP32 expects 16-bit stereo frames: packet length divisible by 4.
            if not payload or len(payload) % 4 != 0:
                await websocket.send_json({
                    "type": "error",
                    "message": "Audio packet must contain complete 16-bit stereo frames."
                })
                continue

            # Keep every UDP datagram within the ESP32's 1200-byte buffer.
            for offset in range(0, len(payload), MAX_UDP_PACKET):
                packet = payload[offset:offset + MAX_UDP_PACKET]
                if len(packet) % 4:
                    packet = packet[:len(packet) - (len(packet) % 4)]
                if not packet:
                    continue
                udp_socket.sendto(packet, target)
                packets_sent += 1
                bytes_sent += len(packet)

            if packets_sent and packets_sent % 100 == 0:
                await websocket.send_json({
                    "type": "stats",
                    "packets_sent": packets_sent,
                    "bytes_sent": bytes_sent
                })

    except WebSocketDisconnect:
        logger.info("Audio WebSocket disconnected.")
    except Exception:
        logger.exception("Audio streaming failed.")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        logger.info(
            "Audio session ended: %s UDP packets, %s bytes",
            packets_sent, bytes_sent
        )
