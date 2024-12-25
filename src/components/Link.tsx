import { PropsWithChildren } from "react";

export function Link({ href, className, isContainer, ariaLabel, children }: PropsWithChildren<{
  href: string,
  className?: string,
  isContainer?: boolean,
  ariaLabel?: string
}>) {
  return (
    <a
      className={`${isContainer ? "" : "link link-primary"} ${className ?? ""}`}
      target="_blank"
      href={href}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  )
}