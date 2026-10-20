package app.vainah.vpn

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Subscription URL is secret. Encrypt on-device using Android Keystore AES-GCM.
 * NEVER send it to analytics, logs, arbitrary URLs or an unverified web view.
 */
class SecureSubscription(private val context: Context) {
    private val alias = "vainah_subscription_aes_v1"
    private val store = context.getSharedPreferences("vpn_secure_profile", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keystore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keystore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    fun save(raw: String): Boolean {
        val url = SubscriptionLink.validate(raw) ?: return false
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(url.toByteArray(Charsets.UTF_8))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val data = Base64.encodeToString(encrypted, Base64.NO_WRAP)
        return store.edit().putString("ciphertext", "$iv:$data").commit()
    }

    fun load(): String? {
        val pair = store.getString("ciphertext", null)?.split(':', limit = 2)
            ?: return null
        if (pair.size != 2) return null
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE, key(),
                GCMParameterSpec(128, Base64.decode(pair[0], Base64.NO_WRAP))
            )
            SubscriptionLink.validate(String(
                cipher.doFinal(Base64.decode(pair[1], Base64.NO_WRAP)), Charsets.UTF_8
            ))
        } catch (_: Exception) {
            // A corrupted or invalidated Keystore key must not leak ciphertext.
            null
        }
    }

    fun delete() { store.edit().remove("ciphertext").apply() }
}
