import { useEffect, useState } from "react";

const IMAGE_CACHE = new Map();
const LOAD_TIMEOUT_MS = 20000;

async function fetchImageBlob(token, src) {
  const cacheKey = `${src}`;
  if (IMAGE_CACHE.has(cacheKey)) {
    return IMAGE_CACHE.get(cacheKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

  try {
    const res = await fetch(src, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error("Failed to load image");
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    IMAGE_CACHE.set(cacheKey, objectUrl);
    return objectUrl;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function IncidentPhoto({ token, src, alt = "Incident photo", variant = "default" }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    if (!src) {
      setObjectUrl(null);
      setState("empty");
      return undefined;
    }

    if (!token) {
      setObjectUrl(null);
      setState("error");
      return undefined;
    }

    let active = true;
    setState("loading");
    setObjectUrl(null);

    fetchImageBlob(token, src)
      .then((url) => {
        if (!active) return;
        setObjectUrl(url);
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setObjectUrl(null);
        setState("error");
      });

    return () => {
      active = false;
    };
  }, [token, src]);

  if (!src) {
    return (
      <span className={`incident-photo incident-photo--empty incident-photo--${variant}`}>
        No incident photo
      </span>
    );
  }

  if (state === "loading") {
    return (
      <span className={`incident-photo incident-photo--loading incident-photo--${variant}`}>
        Loading photo…
      </span>
    );
  }

  if (state === "error" || !objectUrl) {
    return (
      <span className={`incident-photo incident-photo--error incident-photo--${variant}`}>
        Failed to load photo
      </span>
    );
  }

  return (
    <div className={`incident-photo incident-photo--ready incident-photo--${variant}`}>
      <a href={objectUrl} target="_blank" rel="noreferrer" className="incident-photo__link">
        <img src={objectUrl} alt={alt} className="incident-photo__img" />
        {variant === "default" || variant === "drawer" ? (
          <span className="incident-photo__caption">View full photo</span>
        ) : null}
      </a>
    </div>
  );
}
