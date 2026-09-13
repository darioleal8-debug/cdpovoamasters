import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const size = filename.includes("512") ? 512 : 192;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "#0A1220",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: size * 0.2,
        }}
      >
        {/* Basketball hoop ring */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Orange circle / ball */}
          <div
            style={{
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: "50%",
              background: "#F97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Letter H */}
            <span
              style={{
                color: "#0A1220",
                fontSize: size * 0.36,
                fontWeight: 900,
                fontFamily: "system-ui, sans-serif",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              H
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/png",
      },
    }
  );
}
