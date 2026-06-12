import BrandLogo from "./BrandLogo";

export default function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-inner">
        <BrandLogo size="md" />
        <span className="thinking" aria-label="Loading">
          <i /> <i /> <i />
        </span>
      </div>
    </div>
  );
}
