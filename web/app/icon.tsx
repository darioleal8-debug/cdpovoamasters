import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#0A1220",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#F97316",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              color: "#0A1220",
              fontSize: 14,
              fontWeight: 900,
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1,
            }}
          >
            H
          </span>
        </div>
      </div>
    ),
    { width: 32, height: 32 }
  );
}
