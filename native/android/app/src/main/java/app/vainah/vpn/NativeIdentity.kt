package app.vainah.vpn

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Mobile commerce transport only. Clerk Android SDK owns authentication,
 * email/SMS verification, token renewal and secure credential storage.
 * The app never creates or stores its own sign-in tokens.
 */
class NativeIdentity(context:Context) {
    private val prefs=context.getSharedPreferences("vainah_native_orders_v2",Context.MODE_PRIVATE)
    fun lastOrder():String?=prefs.getString("last_order",null)
    fun saveOrder(id:String){
        if(Regex("^[a-f0-9-]{36}$",RegexOption.IGNORE_CASE).matches(id))
            prefs.edit().putString("last_order",id).apply()
    }

    fun sandboxProof():String?=prefs.getString("sandbox_proof",null)
    fun saveSandboxProof(proof:String){
        if(proof.length in 60..3000 &&
           Regex("^[A-Za-z0-9_-]+\\.[a-f0-9]{64}$").matches(proof))
            prefs.edit().putString("sandbox_proof",proof).apply()
    }

    data class Account(val authenticated:Boolean,val verifiedDeliveryEmail:Boolean)
    data class SandboxInvoice(val proof:String,val payUrl:String)
    data class SandboxStatus(val status:String,val noCharge:Boolean,val noVpnGranted:Boolean)
    data class Invoice(val orderId:String,val payUrl:String)
    data class Order(val status:String,val delivery:String,
        val subscriptionUrl:String?,val emailState:String)

    companion object {
        private const val ORIGIN="https://vainahvpnbot0.netlify.app"
        private fun exchange(endpoint:String,body:JSONObject?,clerkJwt:String):JSONObject {
            if(!Regex("^[A-Za-z0-9._-]{40,8192}$").matches(clerkJwt))
                throw IllegalArgumentException("Invalid session")
            val conn=URL(ORIGIN+"/.netlify/functions/"+endpoint)
                .openConnection() as HttpURLConnection
            try{
                conn.connectTimeout=7000;conn.readTimeout=12000
                conn.instanceFollowRedirects=false;conn.useCaches=false
                conn.requestMethod=if(body==null)"GET" else "POST"
                conn.doOutput=body!=null
                conn.setRequestProperty("Accept","application/json")
                conn.setRequestProperty("Authorization","Bearer "+clerkJwt)
                if(body!=null){
                    conn.setRequestProperty("Content-Type","application/json")
                    conn.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}
                }
                val status=conn.responseCode
                if(status !in 200..299){
                    if(endpoint=="clerk-payment-sandbox"){
                        // Only server-owned, exact messages may refine the error.
                        // Never show arbitrary provider responses, tokens or PII.
                        val serverError=runCatching {
                            conn.errorStream?.use { stream ->
                                val bytes=ByteArray(2048)
                                val count=stream.read(bytes)
                                if(count>0)
                                    JSONObject(String(bytes,0,count,Charsets.UTF_8))
                                        .optString("error","")
                                else ""
                            } ?: ""
                        }.getOrDefault("")
                        val code=when(status){
                            401 -> "SANDBOX_SESSION_REJECTED"
                            403 -> "SANDBOX_ACCOUNT_NOT_ALLOWED"
                            404 -> "SANDBOX_ENDPOINT_NOT_DEPLOYED"
                            503 -> if(serverError=="Тестовый режим платежей выключен")
                                "SANDBOX_DISABLED_ON_SERVER"
                                else "SANDBOX_PROVIDER_NOT_READY"
                            429 -> "SANDBOX_RATE_LIMITED"
                            else -> "SANDBOX_HTTP_"+status
                        }
                        throw IllegalStateException(code)
                    }
                    if(endpoint=="mobile-account"){
                        when(status){
                            503 -> throw IllegalStateException("CLERK_SERVER_SETUP")
                            401 -> throw IllegalStateException("CLERK_SESSION_NOT_ACCEPTED")
                            404 -> throw IllegalStateException("CLERK_ENDPOINT_NOT_DEPLOYED")
                        }
                    }
                    throw IllegalStateException("Сервер отклонил запрос (HTTP "+status+").")
                }
                if(conn.contentLengthLong>20_000)
                    throw IllegalStateException("Response too large")
                val bytes=java.io.ByteArrayOutputStream()
                conn.inputStream.use{input->
                    val block=ByteArray(4096)
                    while(true){
                        val n=input.read(block);if(n<0)break
                        if(bytes.size()+n>20_000)throw IllegalStateException("Response too large")
                        bytes.write(block,0,n)
                    }
                }
                return JSONObject(bytes.toString("UTF-8"))
            }finally{conn.disconnect()}
        }
        fun account(jwt:String):Account {
            val result=exchange("mobile-account",null,jwt)
            return Account(
                authenticated=result.optBoolean("authenticated",false),
                verifiedDeliveryEmail=result.optBoolean("emailVerified",false)
            )
        }

        /** Real provider SANDBOX. The only amount is fixed on the server at 10 RUB;
         *  production checkout remains disabled and this never grants VPN.
         */
        fun startSandbox(jwt:String):SandboxInvoice {
            val data=exchange("clerk-payment-sandbox",JSONObject().put("action","start"),jwt)
            if(!data.optBoolean("sandbox",false)||
                !data.optBoolean("noCharge",false)||
                !data.optBoolean("noVpnGranted",false)||
                data.optString("amountRub")!="10.00")
                throw IllegalStateException("Not an isolated sandbox payment")
            val url=data.getString("payUrl")
            val target=URL(url)
            if(target.protocol!="https"||target.host!="pay.rollypay.io"||
                target.port!=-1||target.userInfo!=null||target.ref!=null||
                target.query!=null ||
                !Regex("^/pay/[A-Za-z0-9][A-Za-z0-9_-]{5,255}/?$").matches(target.path))
                throw IllegalStateException("Untrusted test payment URL")
            val proof=data.getString("proof")
            if(proof.length !in 60..3000 ||
                !Regex("^[A-Za-z0-9_-]+\\.[a-f0-9]{64}$").matches(proof))
                throw IllegalStateException("Untrusted test payment receipt")
            return SandboxInvoice(proof,url)
        }
        fun sandboxStatus(jwt:String,proof:String):SandboxStatus {
            if(proof.length !in 60..3000 ||
               !Regex("^[A-Za-z0-9_-]+\\.[a-f0-9]{64}$").matches(proof))
                throw IllegalArgumentException("Invalid sandbox receipt")
            val data=exchange("clerk-payment-sandbox",
                JSONObject().put("action","status").put("proof",proof),jwt)
            if(!data.optBoolean("sandbox",false)||
                !data.optBoolean("noCharge",false)||
                !data.optBoolean("noVpnGranted",false)||
                data.optString("amountRub")!="10.00")
                throw IllegalStateException("Sandbox response not verified")
            val status=data.optString("status")
            if(status !in listOf("created","processing","paid","canceled","expired"))
                throw IllegalStateException("Unrecognized sandbox state")
            return SandboxStatus(status,true,true)
        }

        fun createInvoice(jwt:String,planId:String):Invoice {
            if(VainahPlans.all.none{it.id==planId})throw IllegalArgumentException("Bad plan")
            val data=exchange("mobile-checkout",JSONObject().put("plan",planId),jwt)
            val url=data.getString("payUrl")
            val target=URL(url)
            if(target.protocol!="https"||target.host!="pay.rollypay.io"||
                target.port!=-1||target.userInfo!=null||target.ref!=null||
                !Regex("^/pay/[A-Za-z0-9][A-Za-z0-9_-]{5,255}/?$").matches(target.path))
                throw IllegalStateException("Unsafe payment address")
            return Invoice(data.getString("orderId"),url)
        }
        fun latestOrder(jwt:String,preferredId:String?=null):String? {
            val data=exchange("mobile-orders",null,jwt)
            val list=data.optJSONArray("orders")?:return null
            if(list.length()==0)return null
            val ids=(0 until list.length()).mapNotNull { i ->
                list.optJSONObject(i)?.optString("orderId")
                    ?.takeIf { it.matches(Regex("^[a-fA-F0-9-]{36}$")) }
            }
            // Old local state is NOT proof of ownership; Clerk-owned history is.
            if(preferredId!=null && ids.contains(preferredId))return preferredId
            val pending=data.optString("latestOutstandingOrderId","")
            if(ids.contains(pending))return pending
            val delivered=data.optString("latestDeliveredOrderId","")
            if(ids.contains(delivered))return delivered
            return ids.firstOrNull()
        }
        fun readOrder(jwt:String,id:String):Order {
            if(!Regex("^[a-f0-9-]{36}$",RegexOption.IGNORE_CASE).matches(id))
                throw IllegalArgumentException("Bad order ID")
            val r=exchange("mobile-order?order="+id,JSONObject(),jwt)
            val link=r.optString("subscriptionUrl","").ifBlank{null}
            if(link!=null && (URL(link).protocol!="https"||link.any{it.isWhitespace()}))
                throw IllegalStateException("Unsafe VPN link")
            return Order(r.optString("status"),r.optString("deliveryState"),
                link,r.optString("emailState"))
        }
    }
}
