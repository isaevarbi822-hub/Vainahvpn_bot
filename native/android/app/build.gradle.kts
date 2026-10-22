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
        versionCode = 4
        versionName = "0.4.7"
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // Experimental binary dependency. NOT enabled in public APK previews.
    // Review binary provenance/license and Android VpnService PlatformInterface
    // before enabling runtime connections.
    if (providers.gradleProperty("vainahEnableLibbox").orNull == "true") {
        implementation("com.github.singbox-android:libbox:1.14.0")
    }
    testImplementation("junit:junit:4.13.2")
}
