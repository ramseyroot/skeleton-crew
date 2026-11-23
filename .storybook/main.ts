import type { StorybookConfig } from "@storybook/nextjs-vite";

// Stories run without the database, the cache or any network call. Telemetry is off so Storybook also starts offline.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: "@storybook/nextjs-vite",
  core: { disableTelemetry: true },
};
export default config;
