plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.vainah.vpn"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.vainah.vpn"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "0.4.11"
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    if (providers.gradleProperty("vainahEnableLibbox").orNull == "true") {
        sourceSets.getByName("main").java.srcDir("src/libbox/java")
    }
}

dependencies {
    // Experimental binary dependency. NOT enabled in public APK previews.
    // Review binary provenance/license and Android VpnService PlatformInterface
    // before enabling runtime connections.
    if (providers.gradleProperty("vainahEnableLibbox").orNull == "true") {
        implementation("com.github.singbox-android:libbox:1.14.0")
    }
    testImplementation("junit:junit:4.13.2")
    // Real org.json implementation for JVM-only configuration contract tests.
    testImplementation("org.json:json:20250517")
}
