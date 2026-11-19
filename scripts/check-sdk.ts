import {
  SmartSpectraSDK,
  PixelFormat,
  MetricType,
} from "@smartspectra/node-sdk";

console.log(
  `SmartSpectra ${SmartSpectraSDK.version} native runtime loaded on ${process.platform}/${process.arch}.`,
);
console.log(
  `Custom RGB input supported: format ${PixelFormat.kRGB}; pulse metric ${MetricType.PULSE_RATE}.`,
);
const sdk = new SmartSpectraSDK({ enableTelemetry: false });
sdk.useCustomInput();
await sdk.destroy();
console.log(
  "SDK configuration and teardown passed. Live camera/authentication requires a developer key and is not claimed by this check.",
);
