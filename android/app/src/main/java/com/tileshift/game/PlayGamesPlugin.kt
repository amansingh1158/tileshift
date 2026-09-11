package com.tileshift.game

import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.Scopes
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Task

/**
 * Play Games Services bridge — fully guarded.
 *
 * Play Games is only used when the app ships a games-ids.xml with a real
 * app_id (added from Play Console). Without it, isAvailable() returns false
 * and nothing is attempted, keeping the app fully functional.
 */
@CapacitorPlugin(name = "PlayGames")
class PlayGamesPlugin : Plugin() {

    private fun gamesConfigured(): Boolean {
        return try {
            val id = context.resources.getIdentifier("app_id", "string", context.packageName)
            if (id == 0) return false
            val appId = context.resources.getString(id)
            appId != null && appId.isNotBlank() && appId != "placeholder"
        } catch (e: Exception) {
            false
        }
    }

    private fun signInClient(): GoogleSignInClient {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_GAMES_SIGN_IN)
            .requestScopes(Scope(Scopes.GAMES), Scope(Scopes.GAMES_LITE), Scope(Scopes.DRIVE_APPFOLDER))
            .build()
        return GoogleSignIn.getClient(context, gso)
    }

    private fun isAuthenticated(): Boolean {
        return try {
            GoogleSignIn.getLastSignedInAccount(context) != null
        } catch (e: Exception) {
            false
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", gamesConfigured())
        ret.put("authenticated", isAuthenticated())
        call.resolve(ret)
    }

    @PluginMethod
    fun signIn(call: PluginCall) {
        if (!gamesConfigured()) {
            call.reject("Play Games is not configured")
            return
        }
        val intent: Intent = signInClient().signInIntent
        startActivityForResult(call, intent, "onSignInResult")
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        try {
            signInClient().signOut()
            call.resolve()
        } catch (e: Exception) {
            call.reject("Sign out failed", e)
        }
    }

    @ActivityCallback
    private fun onSignInResult(call: PluginCall, result: ActivityResult) {
        if (result.data == null) {
            call.reject("Sign-in cancelled: " + GoogleSignInStatusCodes.getStatusCodeString(GoogleSignInStatusCodes.SIGN_IN_CANCELLED))
            return
        }
        val task: Task<GoogleSignInAccount> = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val ret = JSObject()
            ret.put("signedIn", true)
            ret.put("idToken", account.idToken ?: "")
            ret.put("serverAuthCode", account.serverAuthCode ?: "")
            ret.put("displayName", account.displayName ?: "")
            ret.put("givenName", account.givenName ?: "")
            ret.put("familyName", account.familyName ?: "")
            ret.put("email", account.email ?: "")
            ret.put("id", account.id ?: "")
            call.resolve(ret)
        } catch (e: ApiException) {
            call.reject("Sign-in failed: " + GoogleSignInStatusCodes.getStatusCodeString(e.statusCode))
        }
    }
}