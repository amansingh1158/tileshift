package com.tileshift.game

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PlayGamesPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}