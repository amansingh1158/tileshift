package com.tileshift.game

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.games.AuthenticationResult
import com.google.android.gms.games.GamesClientStatusCodes
import com.google.android.gms.games.PlayGames
import com.google.android.gms.tasks.Task

/**
 * Play Games Services bridge — fully guarded.
 *
 * Uses Play Games Services v2 (play-services-games-v2). The SDK is
 * initialized in Application.onCreate (TileShiftApp), which v2 requires
 * before any client is created.
 *
 * When Play Games is not configured (no games-ids.xml), every function here
 * resolves to a safe default and the game behaves exactly as before.
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

    private fun statusLabel(code: Int): String {
        return try {
            GamesClientStatusCodes.getStatusCodeString(code)
        } catch (e: Exception) {
            "unknown ($code)"
        }
    }

    private fun codeOf(e: Exception): Int {
        var cur: Throwable? = e
        while (cur != null && cur !is com.google.android.gms.common.api.ApiException) {
            cur = cur.cause
        }
        return if (cur is com.google.android.gms.common.api.ApiException) cur.statusCode else -1
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", gamesConfigured())
        ret.put("authenticated", false)
        if (!gamesConfigured() || activity == null) {
            call.resolve(ret)
            return
        }
        try {
            PlayGames.getGamesSignInClient(activity).isAuthenticated()
                .addOnSuccessListener { result: AuthenticationResult ->
                    ret.put("authenticated", result.isAuthenticated())
                    call.resolve(ret)
                }
                .addOnFailureListener { e ->
                    ret.put("authenticated", false)
                    ret.put("error", e.message ?: "unknown")
                    call.resolve(ret)
                }
        } catch (e: Exception) {
            ret.put("authenticated", false)
            ret.put("error", "init: " + (e.message ?: "unknown"))
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun signIn(call: PluginCall) {
        if (!gamesConfigured()) {
            call.reject("Play Games is not configured for this build (games-ids.xml missing)")
            return
        }
        val act = activity
        if (act == null) {
            call.reject("Activity not available")
            return
        }
        try {
            val task: Task<AuthenticationResult> = PlayGames.getGamesSignInClient(act).signIn()
            task.addOnSuccessListener { result ->
                if (!result.isAuthenticated()) {
                    call.reject("Sign-in could not complete. Check Play Games app is enabled on the device and the game is linked in Play Console.")
                    return@addOnSuccessListener
                }
                PlayGames.getPlayersClient(act).currentPlayer
                    .addOnSuccessListener { player ->
                        val ret = JSObject()
                        ret.put("signedIn", true)
                        ret.put("id", player.playerId ?: "")
                        ret.put("displayName", player.displayName ?: "")
                        call.resolve(ret)
                    }
                    .addOnFailureListener { e ->
                        call.reject("Failed to load player: " + (e.message ?: "unknown error"))
                    }
            }
            task.addOnFailureListener { e ->
                val code = codeOf(e)
                call.reject("Play Games sign-in failed: " + statusLabel(code) + " (" + (e.message ?: "unknown error") + ")")
            }
        } catch (e: Exception) {
            call.reject("Play Games sign-in error: " + (e.message ?: "unknown error"))
        }
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        // The v2 SDK has no signOut() on GamesSignInClient; the local JS name
        // is cleared in web land. Nothing meaningful to do natively.
        call.resolve()
    }
}