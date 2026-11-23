import { useEffect, useState } from "react";
import { Film } from "lucide-react";

interface Props {
  src: string | null | undefined;
  alt: string;
  className?: string;
  iconClassName?: string;
}

export function MoviePoster({
  src,
  alt,
  className = "",
  iconClassName = "h-5 w-5",
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-[#14181c] text-slate-600 ${className}`}
        aria-hidden="true"
      >
        <Film className={iconClassName} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
