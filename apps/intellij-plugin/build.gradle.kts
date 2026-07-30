plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.intellij.platform")
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    // https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin-dependencies-extension.html
    intellijPlatform {
        intellijIdea("2025.2.6.2")
    }

    // Only the platform-free logic (the outline scanner) is unit tested, so
    // plain JUnit is enough — no IDE test fixture needed. JUnit 4 rather than 5
    // because the IntelliJ Platform Gradle plugin runs tests under the IDE's
    // class loader, which expects JUnit 4 on the classpath.
    testImplementation("junit:junit:4.13.2")
    testImplementation(kotlin("test"))
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "252"
            untilBuild = provider { null }
        }
    }
}
