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
}
