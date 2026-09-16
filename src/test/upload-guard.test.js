import { describe, expect, it } from "vitest";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";

function fakeFile({ type = "image/png", size = 100 }) {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], "test.png", { type });
}

describe("uploadImageToCloudinary abuse gate", () => {
  it("rejects non-images before any upload attempt", async () => {
    await expect(uploadImageToCloudinary(fakeFile({ type: "video/mp4" }))).rejects.toThrow(
      "Only image files can be uploaded.",
    );
  });

  it("rejects files over 5 MB", async () => {
    await expect(
      uploadImageToCloudinary(fakeFile({ size: 5 * 1024 * 1024 + 1 })),
    ).rejects.toThrow("Image must be 5 MB or smaller.");
  });
});
