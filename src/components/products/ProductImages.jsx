import { useRef } from "react";

// Multi-image picker for products. Shows existing images (URLs) + newly picked
// files as thumbnails, each removable. Lets the user UPLOAD files or take a
// photo with the CAMERA. Max 5 images total.
//
// Parent owns the data:
//   urls         - existing image URLs (strings)        [edit]
//   files        - newly picked File objects            [add/edit]
//   onUrlsChange, onFilesChange - setters
const MAX = 5;

export default function ProductImages({
  urls = [],
  files = [],
  onUrlsChange,
  onFilesChange,
}) {
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);

  const totalCount = urls.length + files.length;
  const room = Math.max(0, MAX - totalCount);

  const addFiles = (fileList) => {
    const picked = Array.from(fileList || []).slice(0, room);
    if (picked.length) onFilesChange([...files, ...picked]);
  };

  const removeUrl = (i) => onUrlsChange(urls.filter((_, idx) => idx !== i));
  const removeFile = (i) => onFilesChange(files.filter((_, idx) => idx !== i));

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Photos ({totalCount}/{MAX}){" "}
        <span className="font-normal text-gray-400">— first one is the main photo</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <Thumb key={`u${i}`} src={url} onRemove={() => removeUrl(i)} primary={i === 0 && files.length === 0} />
        ))}
        {files.map((f, i) => (
          <Thumb
            key={`f${i}`}
            src={URL.createObjectURL(f)}
            onRemove={() => removeFile(i)}
            primary={urls.length === 0 && i === 0}
          />
        ))}

        {room > 0 && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50"
            >
              <span className="text-lg">⬆️</span>
              <span className="text-[10px]">Upload</span>
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50"
            >
              <span className="text-lg">📷</span>
              <span className="text-[10px]">Camera</span>
            </button>
          </div>
        )}
      </div>

      {/* Hidden inputs: gallery (multiple) and camera (capture). */}
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Thumb({ src, onRemove, primary }) {
  return (
    <div className="relative h-16 w-16">
      <img
        src={src}
        alt=""
        className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
      />
      {primary && (
        <span className="absolute bottom-0 left-0 rounded-br rounded-tl bg-indigo-600 px-1 text-[9px] font-medium text-white">
          Main
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}
