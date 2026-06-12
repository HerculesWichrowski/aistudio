import BrandLogo from "./BrandLogo";

export default function PageLoader() {
  return (
    <div className="page-loader">
      <BrandLogo size="md" />
      <span className="thinking" aria-label="Loading">
        <i /> <i /> <i />
      </span>
    </div>
  );
}
