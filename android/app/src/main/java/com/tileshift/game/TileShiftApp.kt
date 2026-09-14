package com.tileshift.game

import android.app.Application
import com.google.android.gms.games.PlayGamesSdk

class TileShiftApp : Application() {
    override fun onCreate() {
        super.onCreate()
        PlayGamesSdk.initialize(this)
    }
}
