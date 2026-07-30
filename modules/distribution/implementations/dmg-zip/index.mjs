export function createDistribution({ target }) {
  const runtimeBinaries = [
    "Contents/Resources/codex-runtime/darwin-arm64/bin/codex",
    "Contents/Resources/codex-runtime/darwin-arm64/bin/codex-code-mode-host",
    "Contents/Resources/codex-runtime/darwin-arm64/codex-path/rg",
    "Contents/Resources/codex-runtime/darwin-arm64/codex-resources/zsh/bin/zsh",
    "Contents/Resources/codex-runtime/darwin-x64/bin/codex",
    "Contents/Resources/codex-runtime/darwin-x64/bin/codex-code-mode-host",
    "Contents/Resources/codex-runtime/darwin-x64/codex-path/rg",
    "Contents/Resources/codex-runtime/darwin-x64/codex-resources/zsh/bin/zsh",
  ];

  return {
    builderPlatform: "MAC",
    builderTargets: ["dmg", "zip"],
    finalizeArtifacts: async () => [],
    config: {
      forceCodeSigning: true,
      artifactName:
        `ChatGPT-Desktop-Community-\${version}-${target.id}.\${ext}`,
      mac: {
        target: ["dmg", "zip"],
        icon: "assets/community-icon.icns",
        category: "public.app-category.developer-tools",
        type: "distribution",
        hardenedRuntime: true,
        notarize: true,
        strictVerify: true,
        preAutoEntitlements: true,
        binaries: runtimeBinaries,
        x64ArchFiles: "Contents/Resources/codex-runtime/**",
      },
    },
  };
}
