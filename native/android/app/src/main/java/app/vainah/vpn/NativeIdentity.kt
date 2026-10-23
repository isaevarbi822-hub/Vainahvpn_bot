package app.vainah.vpn

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Device-only authenticated state; never persist OTP, addresses or payment credentials. */
class NativeIdentity(private val context: Context) {
    private val prefs = context.getSharedPreferences("vainah_mobile_auth_v1",Context.MODE_PRIVATE)
    private val alias = "vainah_mobile_session_aes_v1"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias,null) as? SecretKey)?.let { return it }
        val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or
            KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build())
        return generator.generateKey()
    }
    fun save(token:String){
        require(token.length in 80..2100 && token.all { it.isLetterOrDigit() || it in "._-" })
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE,key())
        val encrypted=cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val payload=cipher.iv+encrypted
        prefs.edit().putString("session",Base64.encodeToString(payload,Base64.NO_WRAP)).apply()
    }
    fun load(): String? {
        return try {
            val stored = prefs.getString("session",null) ?: return null
            val data=Base64.decode(stored,Base64.DEFAULT)
            if(data.size<29)return null
            val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,data.copyOfRange(0,12)))
            String(cipher.doFinal(data.copyOfRange(12,data.size)),Charsets.UTF_8)
        }catch(_:Exception){null}
    }
    fun clear(){prefs.edit().remove("session").remove("last_order").apply()}
    fun lastOrder():String?=prefs.getString("last_order",null)
    fun saveOrder(id:String) {
        if(Regex("^[a-f0-9-]{36}$",RegexOption.IGNORE_CASE).matches(id))
            prefs.edit().putString("last_order",id).apply()
    }

    data class LoginChallenge(val id:String,val method:String,val contact:String)
    data class LoginResult(val token:String,val emailVerified:Boolean)
    data class Invoice(val orderId:String,val payUrl:String)
    data class Order(val status:String,val delivery:String,val subscriptionUrl:String?,
                     val emailState:String)
    data class BrowserLink(val flowId:String,val pollSecret:String,val browserUrl:String)

    companion object{
        private const val ORIGIN="https://vainahvpnbot0.netlify.app"
        private fun exchange(endpoint:String,body:JSONObject?,token:String?=null):JSONObject {
            val conn=URL(ORIGIN+"/.netlify/functions/"+endpoint)
                .openConnection() as HttpURLConnection
            try {
                conn.connectTimeout=7000; conn.readTimeout=12000
                conn.instanceFollowRedirects=false; conn.useCaches=false
                conn.setRequestProperty("Accept","application/json")
                if(token!=null)conn.setRequestProperty("Authorization","Bearer "+token)
                if(body!=null){
                    conn.requestMethod="POST";conn.doOutput=true
                    conn.setRequestProperty("Content-Type","application/json")
                    conn.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}
                }
                if(conn.responseCode !in 200..299)throw IllegalStateException(
                    "Сервер не подтвердил запрос (HTTP "+conn.responseCode+").")
                if(conn.contentLengthLong>20_000)throw IllegalStateException("Ответ слишком большой")
                val buffer=java.io.ByteArrayOutputStream()
                conn.inputStream.use{input->
                    val bytes=ByteArray(4096)
                    while(true){
                        val n=input.read(bytes);if(n<0)break
                        if(buffer.size()+n>20_000)throw IllegalStateException("Ответ слишком большой")
                        buffer.write(bytes,0,n)
                    }
                }
                return JSONObject(buffer.toString("UTF-8"))
            }finally{conn.disconnect()}
        }
        fun sendOtp(method:String,contact:String,token:String?=null):LoginChallenge {
            if(method !in setOf("email","phone"))throw IllegalArgumentException("Wrong method")
            val linking=token!=null
            val body=JSONObject().put("action",if(linking)"email-send" else "send")
                .put("method",if(linking)"email" else method).put("contact",contact.trim())
            val result=exchange("mobile-auth",body,token)
            if(!result.optBoolean("sent"))throw IllegalStateException("Код не отправлен")
            val challenge=result.getString("challenge")
            return LoginChallenge(challenge,if(linking)"email" else method,contact.trim())
        }
        fun confirmOtp(challenge:LoginChallenge,code:String,token:String?=null):LoginResult {
            val body=JSONObject().put("action",if(token!=null)"email-check" else "check")
                .put("method",challenge.method).put("contact",challenge.contact)
                .put("challenge",challenge.id).put("code",code)
            val response=exchange("mobile-auth",body,token)
            if(!response.optBoolean("authenticated"))throw IllegalStateException("Проверка не пройдена")
            return LoginResult(response.getString("token"),response.optBoolean("emailVerified"))
        }
        fun beginExternal(provider:String):BrowserLink {
            if(provider !in setOf("telegram","yandex"))throw IllegalArgumentException("Invalid provider")
            val result=exchange("mobile-link",JSONObject()
                .put("action","start").put("provider",provider))
            val flow=result.getString("flowId")
            val secret=result.getString("pollSecret")
            val raw=result.getString("browserUrl")
            val url=URL(raw)
            if(!Regex("^[a-f0-9-]{36}$",RegexOption.IGNORE_CASE).matches(flow) ||
               !Regex("^[a-f0-9]{64}$").matches(secret) ||
               url.protocol!="https"||url.host!="vainahvpnbot0.netlify.app" ||
               url.port!=-1||url.path!="/mobile-link.html"||url.userInfo!=null||
               url.ref!=null)
                throw IllegalStateException("Unexpected external login URL")
            return BrowserLink(flow,secret,raw)
        }
        fun finishExternal(link:BrowserLink):LoginResult? {
            val result=exchange("mobile-link",JSONObject()
                .put("action","poll").put("flowId",link.flowId)
                .put("pollSecret",link.pollSecret))
            if(result.optBoolean("pending"))return null
            if(!result.optBoolean("authenticated"))throw IllegalStateException("Login not confirmed")
            return LoginResult(result.getString("token"),result.optBoolean("emailVerified"))
        }

        fun createInvoice(token:String,planId:String):Invoice {
            if(VainahPlans.all.none{it.id==planId})throw IllegalArgumentException("Invalid tariff")
            val result=exchange("mobile-checkout",JSONObject().put("plan",planId),token)
            val payUrl=result.getString("payUrl");val target=URL(payUrl)
            if(target.protocol!="https"||target.host!="pay.rollypay.io"||target.port!=-1||
               target.userInfo!=null||target.query!=null||target.ref!=null||
               !Regex("^/pay/[A-Za-z0-9][A-Za-z0-9_-]{5,255}/?$").matches(target.path))
                throw IllegalStateException("Небезопасная ссылка платежа")
            return Invoice(result.getString("orderId"),payUrl)
        }
        fun readOrder(token:String,id:String):Order {
            if(!Regex("^[a-f0-9-]{36}$",RegexOption.IGNORE_CASE).matches(id))
                throw IllegalArgumentException("Invalid order id")
            val result=exchange("mobile-order?order="+id,JSONObject(),token)
            val url=result.optString("subscriptionUrl","").ifBlank{null}
            if(url!=null && (URL(url).protocol!="https"||url.any{it.isWhitespace()}))
                throw IllegalStateException("Unsafe subscription URL")
            return Order(result.optString("status"),result.optString("deliveryState"),
                url,result.optString("emailState"))
        }
    }
}
