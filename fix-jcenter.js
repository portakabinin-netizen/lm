const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withJCenterFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('mavenCentral()')) {
      // 1. Force MavenCentral and Jitpack globally
      // 2. Add a resolution strategy to force Kotlin 2.1.20 on subprojects
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects {[\s\S]*?repositories {/,
        `allprojects {
    repositories {
        mavenCentral()
        maven { url "https://repo1.maven.org/maven2/" }
        maven { url "https://www.jitpack.io" }`
      );

      config.modResults.contents += `
subprojects {
    project.configurations.all {
        resolutionStrategy {
            force "org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20"
            force "org.jetbrains.kotlin:kotlin-stdlib:2.1.20"
        }
    }
}
`;
    }
    return config;
  });
};