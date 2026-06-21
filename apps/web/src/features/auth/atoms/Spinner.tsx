type SpinnerProps = {
  size?: number;
  color?: string;
};

export const Spinner = ({
  size = 18,
  color = "currentColor",
}: SpinnerProps): React.ReactElement => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className="animate-spin"
    aria-hidden
    role="presentation"
  >
    <title>Loading</title>
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke={color}
      strokeWidth="2.5"
      strokeOpacity="0.18"
      fill="none"
    />
    <path
      d="M21 12a9 9 0 0 1-9 9"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);
