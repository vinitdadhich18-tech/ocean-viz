import React, { useState, useEffect, useCallback } from 'react';

import ControlPanel from './components/ControlPanel.jsx';
import Scene from './components/Scene.jsx';
import Legend from './components/Legend.jsx';
import ProfilePanel from './components/ProfilePanel.jsx';
import DailyReportPanel from './components/DailyReportPanel.jsx';
import TimeControl from './components/TimeControl.jsx';
import GlobeView from './components/GlobeView.jsx';

import { Globe, RefreshCw } from 'lucide-react';

import {
  getField,
  getDepths,
  getFloats,
  getFloatProfile,
  getTimesteps,
} from './api.js';


const VARIABLE_RANGES = {
  currents: {
    min: 0.0,
    max: 0.85,
    palette: 'flow',
  },
  temperature: {
    min: 12.0,
    max: 31.0,
    palette: 'thermal',
  },
  salinity: {
    min: 30.0,
    max: 35.5,
    palette: 'haline',
  },
  chlorophyll: {
    min: 0.05,
    max: 3.5,
    palette: 'algae',
  },
};


export default function App() {

  // ==============================
  // VIEW STATE
  // ==============================

  const [view, setView] = useState('globe');


  // ==============================
  // OCEAN DATA STATE
  // ==============================

  const [activeVariable, setActiveVariable] = useState('currents');

  const [activeDepth, setActiveDepth] = useState(0);

  const [availableDepths, setAvailableDepths] = useState([
    0,
    50,
    100,
    200,
    500,
    1000,
    2000,
    3000,
    3992,
  ]);

  const [activeTime, setActiveTime] = useState('2026-08-20');

  const [timesteps, setTimesteps] = useState([
    '2026-08-20',
    '2026-08-21',
    '2026-08-22',
    '2026-08-23',
    '2026-08-24',
  ]);

  const [isPlaying, setIsPlaying] = useState(false);


  // ==============================
  // VISUALIZATION CONTROLS
  // ==============================

  const [palette, setPalette] = useState('flow');

  // Only: linear | log
  const [scaleMode, setScaleMode] = useState('linear');

  // Manual overrides
  const [minOverride, setMinOverride] = useState(null);
  const [maxOverride, setMaxOverride] = useState(null);

  const [verticalExaggeration, setVerticalExaggeration] = useState(1.0);

  const [sliceOpacity, setSliceOpacity] = useState(0.92);

  const [renderMode, setRenderMode] = useState('slices');


  // ==============================
  // BACKEND DATA
  // ==============================

  const [slicesData, setSlicesData] = useState([]);

  const [floatsData, setFloatsData] = useState([]);

  const [selectedFloatProfile, setSelectedFloatProfile] =
    useState(null);


  // ==============================
  // UI STATE
  // ==============================

  const [reportPanelOpen, setReportPanelOpen] =
    useState(false);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [retryCount, setRetryCount] = useState(0);


  // ==============================
  // AUTO VARIABLE CONFIG
  // ==============================

  const [valueRange, setValueRange] = useState(
    VARIABLE_RANGES.currents
  );


  // Update palette and default range
  // when variable changes
  useEffect(() => {

    const config =
      VARIABLE_RANGES[activeVariable] ||
      VARIABLE_RANGES.currents;

    setPalette(config.palette);

    setValueRange({
      min: config.min,
      max: config.max,
    });

    // Reset manual range overrides
    setMinOverride(null);
    setMaxOverride(null);

  }, [activeVariable]);


  // ==============================
  // FETCH DEPTHS + TIME + FLOATS
  // ==============================

  useEffect(() => {

    let isSubscribed = true;


    // Fetch available depths
    getDepths(activeVariable)
      .then((depths) => {

        if (
          !isSubscribed ||
          !Array.isArray(depths) ||
          depths.length === 0
        ) {
          return;
        }

        const numericDepths = depths
          .map(Number)
          .filter(Number.isFinite)
          .sort((a, b) => a - b);

        if (numericDepths.length === 0) return;

        setAvailableDepths(numericDepths);

        setActiveDepth((currentDepth) => {

          const numericCurrentDepth =
            Number(currentDepth);

          if (
            numericDepths.includes(
              numericCurrentDepth
            )
          ) {
            return numericCurrentDepth;
          }

          return numericDepths[0];

        });

      })
      .catch((err) => {

        console.error(
          '[App] Error fetching depths metadata:',
          err
        );

      });


    // Fetch available timesteps
    getTimesteps()
      .then((steps) => {

        if (
          !isSubscribed ||
          !Array.isArray(steps) ||
          steps.length === 0
        ) {
          return;
        }

        setTimesteps(steps);

        setActiveTime((currentTime) => {

          if (steps.includes(currentTime)) {
            return currentTime;
          }

          return steps[0];

        });

      })
      .catch((err) => {

        console.error(
          '[App] Error fetching timesteps:',
          err
        );

      });


    // Fetch Argo float markers
    getFloats()
      .then((floats) => {

        if (!isSubscribed) return;

        setFloatsData(
          Array.isArray(floats) ? floats : []
        );

      })
      .catch((err) => {

        console.error(
          '[App] Error fetching floats index:',
          err
        );

      });


    return () => {
      isSubscribed = false;
    };

  }, [activeVariable]);


  // ==============================
  // FETCH OCEAN FIELD DATA
  // ==============================

  useEffect(() => {

    if (
      !availableDepths ||
      availableDepths.length === 0
    ) {
      return;
    }

    let isSubscribed = true;

    setLoading(true);
    setError(null);


    const fetchPromises = availableDepths.map(
      (depth) =>
        getField(
          activeVariable,
          depth,
          activeTime
        )
    );


    Promise.allSettled(fetchPromises)

      .then((results) => {

        if (!isSubscribed) return;


        const validSlices = results
          .filter(
            (result) =>
              result.status === 'fulfilled' &&
              result.value
          )
          .map(
            (result) => result.value
          );


        if (validSlices.length === 0) {

          setSlicesData([]);

          setError(
            'Unable to load ocean field data. Please try again.'
          );

        } else {

          setSlicesData(validSlices);

          setError(null);

        }


        setLoading(false);

      })

      .catch((err) => {

        console.error(
          '[App] Error loading ocean field data:',
          err
        );

        if (!isSubscribed) return;

        setSlicesData([]);

        setError(
          'Unable to load ocean field data. Please try again.'
        );

        setLoading(false);

      });


    return () => {
      isSubscribed = false;
    };

  }, [
    activeVariable,
    availableDepths,
    activeTime,
    retryCount,
  ]);


  // ==============================
  // FLOAT PROFILE SELECTION
  // ==============================

  const handleFloatSelect = useCallback(
    (floatId) => {

      console.log(
        `[App] Selected float: ${floatId}`
      );


      getFloatProfile(floatId)

        .then((profile) => {
          setSelectedFloatProfile(profile);
        })

        .catch((err) => {

          console.error(
            `[App] Error fetching profile for ${floatId}:`,
            err
          );

        });

    },
    []
  );


  // ==============================
  // COLOR RANGE
  // ==============================

  const handleResetRange = () => {

    setMinOverride(null);
    setMaxOverride(null);

  };


  const effectiveMin =
    minOverride !== null
      ? minOverride
      : valueRange.min;


  const effectiveMax =
    maxOverride !== null
      ? maxOverride
      : valueRange.max;


  // ==============================
  // GLOBE VIEW
  // ==============================

  if (view === 'globe') {

    return (
      <GlobeView
        onSelectRegion={() =>
          setView('region')
        }
        floatsCount={floatsData.length}
      />
    );

  }


  // ==============================
  // REGION VIEW
  // ==============================

  return (

    <div className="flex h-screen w-screen overflow-hidden bg-ocean-deep text-slate-100 font-sans">


      {/* LEFT CONTROL PANEL */}

      <ControlPanel

        activeVariable={activeVariable}
        onSelectVariable={setActiveVariable}

        activeDepth={activeDepth}
        onSelectDepth={setActiveDepth}
        availableDepths={availableDepths}

        onOpenReportPanel={() =>
          setReportPanelOpen(true)
        }

        palette={palette}
        onSelectPalette={setPalette}

        scaleMode={scaleMode}
        onToggleScaleMode={setScaleMode}

        minOverride={minOverride}
        maxOverride={maxOverride}

        onChangeMinOverride={setMinOverride}
        onChangeMaxOverride={setMaxOverride}

        onResetRange={handleResetRange}

        autoMin={effectiveMin}
        autoMax={effectiveMax}

        verticalExaggeration={
          verticalExaggeration
        }

        onChangeVerticalExaggeration={
          setVerticalExaggeration
        }

        sliceOpacity={sliceOpacity}

        onChangeSliceOpacity={
          setSliceOpacity
        }

      />


      {/* MAIN VIEWPORT */}

      <main className="relative flex-1 h-full bg-ocean-dark overflow-hidden">


        {/* BACK TO GLOBE */}

        <button

          onClick={() =>
            setView('globe')
          }

          className="absolute top-4 left-4 z-30 px-3.5 py-2 rounded-xl bg-ocean-panel/85 backdrop-blur-xl border border-ocean-border hover:border-cyan-400/80 text-slate-200 hover:text-white text-xs font-mono font-medium flex items-center gap-2 shadow-2xl transition-all duration-200 hover:scale-105 group"

          title="Return to Global View"

        >

          <Globe className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform duration-300" />

          <span>
            Global Earth View
          </span>

        </button>


        {/* LOADING OVERLAY */}

        {loading && (

          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ocean-dark/70 backdrop-blur-md">

            <div className="flex items-center gap-3.5 px-5 py-3 rounded-2xl bg-ocean-panel border border-ocean-border shadow-2xl shadow-cyan-950/50">

              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />

              <span className="text-xs text-slate-200 font-mono tracking-wide">

                Synthesizing 3D Ocean Volume...

              </span>

            </div>

          </div>

        )}


        {/* ERROR OVERLAY */}

        {error && !loading && (

          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ocean-dark/60 backdrop-blur-sm">

            <div className="max-w-sm px-6 py-5 rounded-2xl bg-ocean-panel border border-red-400/30 shadow-2xl text-center">


              <p className="text-sm text-red-300 font-medium mb-2">

                Ocean Data Unavailable

              </p>


              <p className="text-xs text-slate-400 mb-4">

                {error}

              </p>


              <button

                onClick={() =>
                  setRetryCount(
                    (count) => count + 1
                  )
                }

                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-mono font-bold hover:bg-cyan-400 transition-colors"

              >

                Retry

              </button>


            </div>

          </div>

        )}


        {/* THREE.JS OCEAN SCENE */}

        <Scene

          slicesData={slicesData}

          activeDepth={activeDepth}
          availableDepths={availableDepths}

          activeVariable={activeVariable}

          activeTime={activeTime}

          floatsData={floatsData}

          onFloatSelect={handleFloatSelect}

          palette={palette}

          scaleMode={scaleMode}

          minOverride={minOverride}
          maxOverride={maxOverride}

          renderMode={renderMode}

          verticalExaggeration={
            verticalExaggeration
          }

          sliceOpacity={sliceOpacity}

        />


        {/* TIME CONTROL */}

        <TimeControl

          timesteps={timesteps}

          activeTime={activeTime}

          onSelectTime={setActiveTime}

          isPlaying={isPlaying}

          onTogglePlay={setIsPlaying}

        />


        {/* RENDER MODE SWITCHER */}

        <div className="absolute bottom-6 left-6 z-30 flex items-center gap-1 p-1 rounded-xl bg-ocean-panel/90 backdrop-blur-xl border border-ocean-border shadow-2xl">

          {[
            {
              id: 'slices',
              label: 'Stacked Slices',
            },
            {
              id: 'volume',
              label: 'Volumetric Stack',
            },
            {
              id: 'isosurface',
              label: 'Isosurface (Beta)',
            },
          ].map((mode) => (

            <button

              key={mode.id}

              onClick={() =>
                setRenderMode(mode.id)
              }

              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-200 ${
                renderMode === mode.id
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}

            >

              {mode.label}

            </button>

          ))}

        </div>


        {/* SCIENTIFIC LEGEND */}

        <Legend

          variable={activeVariable}

          minVal={effectiveMin}

          maxVal={effectiveMax}

          palette={palette}

        />


        {/* ARGO PROFILE PANEL */}

        {selectedFloatProfile && (

          <ProfilePanel

            profileData={selectedFloatProfile}

            activeVariable={activeVariable}

            onClose={() =>
              setSelectedFloatProfile(null)
            }

          />

        )}


        {/* DAILY REPORT PANEL */}

        <DailyReportPanel

          activeTime={activeTime}

          open={reportPanelOpen}

          onClose={() =>
            setReportPanelOpen(false)
          }

        />


      </main>

    </div>

  );

}