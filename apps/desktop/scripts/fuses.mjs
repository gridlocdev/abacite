// electron-builder afterPack hook: turns off the Electron features an attacker could use to run code through
// the app, before the app is signed. Check a build with `npx @electron/fuses read --app <path>`.
import path from 'node:path';
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';

export default async function afterPack(context) {
  const { appOutDir, electronPlatformName: platform, packager } = context;
  const name = packager.appInfo.productFilename;
  const app =
    platform === 'darwin'
      ? path.join(appOutDir, `${name}.app`)
      : path.join(appOutDir, platform === 'win32' ? `${name}.exe` : packager.executableName);
  await flipFuses(app, {
    version: FuseVersion.V1,
    // The ad-hoc signature no longer matches after the flip; reset it so the app still runs until it is signed.
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // electron-builder.yml packages the app as an asar.
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
}
