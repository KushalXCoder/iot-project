
"use client";

const API_URL =
  process.env.NEXT_PUBLIC_HAVEN_API_URL ||
  "http://127.0.0.1:8000";

export default function ESP32Camera() {
  return (
    <div className="w-full overflow-hidden rounded-xl bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <div>
          <h3 className="font-semibold">Entrance Camera</h3>
          <p className="text-xs text-gray-400">
            ESP32-CAM · OV2640 · AI Face Recognition
          </p>
        </div>

        <span className="text-sm text-green-400">
          ● Live
        </span>
      </div>

      <img
        src={`${API_URL}/camera/stream`}
        alt="Live camera with face detection and recognition"
        className="block w-full aspect-video object-contain"
      />
    </div>
  );
}
