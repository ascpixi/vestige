import React, { createContext } from "react";

/** Represents a single article of the help center. */
export interface HelpPage {
    title: string;
    content: React.ReactNode;

    /** If specified, an icon to display alongside the title of the article. */
    icon?: (className: string) => React.ReactNode;

    /** If specified, the name of the category the article belongs to. */
    category?: string;
}

/** Allows any component to open an article in the help center. */
export const HelpContext = createContext<{ show: (page: HelpPage) => void }>({
    show: () => {}
});
