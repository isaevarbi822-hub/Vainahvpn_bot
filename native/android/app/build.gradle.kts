plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose") apply false
}

// External RollyPay checkout is not bundled into Google Play builds.
// The off-Play test build still requires backend checkoutReady=true,
// matching server prices, Telegram authentication and signed webhook.
val clerkEnabled = providers.gradleProperty("vainahEnableClerk").orNull == "true"
val clerkPublishableKey = providers.gradleProperty("vainahClerkPublishableKey").orNull ?: ""
if (clerkEnabled) {
    apply(plugin = "org.jetbrains.kotlin.plugin.compose")
}
val standaloneCheckout = providers.gradleProperty("vainahStandaloneCheckout")
    .orNull == "true"

android {
    namespace = "app.vainah.vpn"
    compileSdk = if (clerkEnabled) 36 else 35

    defaultConfig {
        applicationId = "app.vainah.vpn"
        minSdk = 26
        targetSdk = 35
        versionCode = 17
        versionName = "0.5.1"
        buildConfigField("boolean", "VAINAH_CLERK_ENABLED", if (clerkEnabled) "true" else "false")
        buildConfigField("String", "VAINAH_CLERK_PUBLISHABLE_KEY",
            "\""+clerkPublishableKey.replace("\\","").replace("\"","")+"\"")
        buildConfigField("boolean", "VAINAH_DIRECT_CHECKOUT_ENABLED",
            if (standaloneCheckout) "true" else "false")
    }
    buildFeatures {
        compose = clerkEnabled
        buildConfig = true
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
    if (clerkEnabled) {
        sourceSets.getByName("main").java.srcDir("src/clerk/java")
    }
}

dependencies {
    if (clerkEnabled) {
        implementation("com.clerk:clerk-android-ui:1.1.4")
        implementation(platform("androidx.compose:compose-bom:2025.06.01"))
        implementation("androidx.compose.ui:ui")
        implementation("androidx.compose.material3:material3")
        implementation("androidx.activity:activity-compose:1.10.1")
        implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.2")
    }
    // Keep a checkout on screen within our app without collecting card details.
    implementation("androidx.browser:browser:1.8.0")
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
