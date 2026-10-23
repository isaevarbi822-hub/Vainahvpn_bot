package app.vainah.vpn

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.Button
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.clerk.api.Clerk
import com.clerk.ui.auth.AuthView
import com.clerk.ui.userbutton.UserButton

class ClerkLoginActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        if (!BuildConfig.VAINAH_CLERK_ENABLED ||
            !BuildConfig.VAINAH_CLERK_PUBLISHABLE_KEY.startsWith("pk_")) {
            finish()
            return
        }
        setContent {
            val initialized by Clerk.isInitialized.collectAsStateWithLifecycle()
            val session by Clerk.sessionFlow.collectAsStateWithLifecycle()
            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center) {
                when {
                    !initialized -> Text("Подключаем Clerk…")
                    session==null -> AuthView()
                    else -> Column(Modifier.padding(20.dp),
                        horizontalAlignment=Alignment.CenterHorizontally) {
                        Text("Вход в Vainah VPN подтверждён")
                        UserButton()
                        Button(onClick={finish()}) { Text("Вернуться в Vainah VPN") }
                    }
                }
            }
        }
    }
}
