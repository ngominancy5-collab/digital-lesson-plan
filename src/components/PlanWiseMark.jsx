/** Shared PlanWise AI open-book mark (vector — always crisp). */
export default function PlanWiseMark({ className = 'pw-mark' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      <path fill="#C9A04D" d="M20 4.8 33.4 10.2 20 15.6 6.6 10.2 20 4.8Z" />
      <path fill="#C9A04D" d="M30.2 12.1v5.6c0 .55-.62.9-1.12.6L20 14.4l-9.08 3.9c-.5.3-1.12-.05-1.12-.6v-5.6L20 16.2l10.2-4.1Z" />
      <path fill="#063B2D" d="M6.5 17.4c4.4 2.1 8.6 2.1 13.5 0v15.4c-4.9 2.1-9.1 2.1-13.5 0V17.4Z" />
      <path fill="#147A4B" d="M33.5 17.4c-4.4 2.1-8.6 2.1-13.5 0v15.4c4.9 2.1 9.1 2.1 13.5 0V17.4Z" />
      <path fill="#F8EFD9" d="M19.15 17.6h1.7v14.8h-1.7z" />
    </svg>
  );
}
