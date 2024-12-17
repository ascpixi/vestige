import { PropsWithChildren } from "react";

export function PlainField({ name, description, align, children }: PropsWithChildren<{
  name: string,
  description: string,
  align?: "left" | "right"
}>) {
  align ??= "left";

  return (
    <div className={`
      flex flex-col gap-1 align-middle
      ${align === "right" ? "text-right" : ""}
    `}>
      <span className="font-semibold">{name}</span>
      <span>{description}</span>

      {children}
    </div>
  );
}