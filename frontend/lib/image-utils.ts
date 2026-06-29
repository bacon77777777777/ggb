/**
 * Utility functions for image processing
 */

/**
 * Compresses an image file to be under a certain size limit.
 * It resizes the image if dimensions are too large and adjusts JPEG quality.
 * 
 * @param file The original image file
 * @param maxWidth Max width of the output image (default 800px for avatars)
 * @param maxHeight Max height of the output image (default 800px for avatars)
 * @param quality Initial quality (0 to 1)
 * @param maxSizeMB Max file size in MB (default 1MB)
 * @returns Promise<File> The compressed file
 */
export async function compressImage(
  file: File, 
  maxWidth = 800, 
  maxHeight = 800, 
  initialQuality = 0.8,
  maxSizeMB = 1
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions (resize if needed)
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Recursive function to reduce quality until file size is met
        const attemptCompression = (currentQuality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Compression failed'));
                return;
              }

              // Check if size is acceptable or quality is too low
              if (blob.size > maxSizeMB * 1024 * 1024 && currentQuality > 0.1) {
                // If still too big, try lower quality
                attemptCompression(currentQuality - 0.1);
              } else {
                // Create a new File object
                // Note: We use image/jpeg for compression efficiency
                const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                const compressedFile = new File([blob], newFileName, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              }
            },
            'image/jpeg',
            currentQuality
          );
        };

        attemptCompression(initialQuality);
      };
      
      img.onerror = (error) => reject(error);
    };
    
    reader.onerror = (error) => reject(error);
  });
}

export function sanitizeImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\)+$/, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('/')) return cleaned;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
