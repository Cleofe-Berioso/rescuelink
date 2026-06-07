import { useEffect, useState } from "react";

export default function AuthenticatedImage({ token, src, alt = "Emergency photo" }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !src) return undefined;

    let active = true;
    let blobUrl = null;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(src, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load image");
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(blobUrl);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [token, src]);

  if (loading) {
    return <span className="auth-image auth-image--loading">Loading photo…</span>;
  }

  if (error || !objectUrl) {
    return <span className="auth-image auth-image--error">Photo unavailable</span>;
  }

  return (
    <a href={objectUrl} target="_blank" rel="noreferrer" className="auth-image-link">
      <img src={objectUrl} alt={alt} className="auth-image__thumb" />
      <span>View full photo</span>
    </a>
  );
}
