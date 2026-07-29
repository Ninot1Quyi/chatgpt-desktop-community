export function createDistribution({ product, target }) {
  return {
    builderPlatform: "WINDOWS",
    builderTargets: ["nsis"],
    config: {
      artifactName:
        `ChatGPT-Desktop-Community-Setup-\${version}-${target.id}.\${ext}`,
      win: {
        target: ["nsis"],
        icon: "assets/community-icon.ico",
      },
      nsis: {
        oneClick: true,
        perMachine: false,
        shortcutName: product.productName,
      },
    },
  };
}
