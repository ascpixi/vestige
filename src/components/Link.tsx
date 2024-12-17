import { PropsWithChildren } from "react";

export function Link({ href, className, isContainer, children }: PropsWithChildren<{
  href: string,
  className?: string,
  isContainer?: boolean
}>) {
  return (
    <a
      className={`${isContainer ? "" : "link link-primary"} ${className ?? ""}`}
      target="_blank"
      href={href}
    >
      {children}
    </a>
  )
}