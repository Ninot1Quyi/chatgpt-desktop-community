export function createDistribution({ target }) {
  return {
    builderPlatform: "MAC",
    builderTargets: ["dmg", "zip"],
    config: {
      artifactName:
        `ChatGPT-Desktop-Community-\${version}-${target.id}.\${ext}`,
      mac: {
        target: ["dmg", "zip"],
        icon: "assets/community-icon.icns",
        category: "public.app-category.developer-tools",
      },
    },
  };
}
