plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val nativeEngine = file("libs/libbox.aar").isFile

android {
    sourceSets {
        getByName("main") {
            if (nativeEngine) java.srcDir("src/engine/java")
        }
    }
    namespace = "app.vainah.vpn"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.vainah.vpn"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0-preview"
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
    testImplementation("junit:junit:4.13.2")
    // Android ships org.json; desktop JVM unit tests need its real implementation.
    testImplementation("org.json:json:20240303")
    // Only included by the isolated libbox build workflow. An AAR alone
    // does NOT make the VPN active; EngineRegistry remains fail-closed.
    if (nativeEngine) {
        implementation(files("libs/libbox.aar"))
    }
}
