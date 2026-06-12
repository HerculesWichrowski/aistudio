import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  href?: string;
};

const sizes = {
  sm: { img: 28, name: 14, sub: 10 },
  md: { img: 36, name: 16, sub: 11 },
  lg: { img: 44, name: 18, sub: 12 },
};

export default function BrandLogo({
  size = "md",
  showSubtitle = true,
  href,
}: BrandLogoProps) {
  const s = sizes[size];

  const content = (
    <>
      <Image
        src="/emplex-logo.png"
        alt="Emplex"
        width={s.img}
        height={s.img}
        className="brand-logo-img"
        priority
      />
      <span className="brand-text">
        <span className="brand-name" style={{ fontSize: s.name }}>
          Emplex
        </span>
        {showSubtitle && (
          <span className="brand-sub" style={{ fontSize: s.sub }}>
            AI Studio
          </span>
        )}
      </span>
    </>
  );

  if (href) {
    return (
      <Link className="brand" href={href}>
        {content}
      </Link>
    );
  }

  return <span className="brand">{content}</span>;
}
