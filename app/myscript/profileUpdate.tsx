import { httpClient } from "@/context/AuthContext";
import * as ImagePicker from "expo-image-picker";
type UploadResult = {
  urls: string[];
};

export async function pickAndUploadImages(
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  try {
    // Permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      alert("Camera permission required!");
      return { urls: [] };
    }

    // Pick multiple images (Gallery)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.All,
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (result.canceled) return { urls: [] };

    const assets = result.assets ?? [];
    const uploadedUrls: string[] = [];

    for (const asset of assets) {
      const base64 = await fileToBase64(asset.uri);
      if (!base64) continue;

      const uploadRes = await httpClient.post(`/auth/upload`,
        { imageBase64: `data:image/jpeg;base64,${base64}` },
        {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round(
                (progressEvent.loaded / progressEvent.total) * 100
              );
              onProgress?.(percent);
            } else {
              // If total is missing, send basic progress
              onProgress?.(0);
            }
          },
        }
      );

      uploadedUrls.push(uploadRes.data.url);
    }

    return { urls: uploadedUrls };
  } catch (err) {
    console.error(err);
    return { urls: [] };
  }
}

// Convert file to Base64
async function fileToBase64(uri: string): Promise<string | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result?.toString().split(",")[1] || null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error(err);
    return null;
  }
}
