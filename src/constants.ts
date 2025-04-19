export interface SetTemplate {
  id: string;
  reps: string;
  weight: string;
}

export interface ExerciseTemplate {
  id: string;
  name: string;
  sets: SetTemplate[];
  category: string;  // ✅ Should match one of VALID_CATEGORIES
  muscleGroup: string[];  // ✅ Should contain only values from VALID_MUSCLE_GROUPS
  equipment: string;  // ✅ Should match one of VALID_EQUIPMENT
  description?: string;
  imageUri?: string;
}

export const VALID_CATEGORIES = ['Strength', 'Cardio', 'Flexibility', 'Mobility'];
export const VALID_MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export const VALID_EQUIPMENT = ['Dumbbells', 'Barbell', 'Kettlebell', 'Bodyweight', 'Resistance Bands', 'Machines', 'Medicine Ball', 'Other'];

export const predefinedExercises: ExerciseTemplate[] = [
  {
    id: 'bench_press',
    name: 'Bench Press',
    category: 'Strength',
    muscleGroup: ['Chest', 'Arms'],
    equipment: 'Barbell',
    sets: [],
    description: 'Lie on a flat bench, grip the barbell with a shoulder-width grip, lower it to your chest, and press upward.',
    imageUri: 'Barbell bench press.mp4'
  },
  {
    id: 'incline_bench_press',
    name: 'Incline Bench Press',
    category: 'Strength',
    muscleGroup: ['Chest', 'Shoulders'],
    equipment: 'Barbell',
    sets: [],
    description: 'Set the bench to an incline, lie back, lower the barbell to your upper chest, and press it back up.',
    imageUri: 'Barbell incline bench press.mp4'
  },
  {
    id: 'decline_bench_press',
    name: 'Decline Bench Press',
    category: 'Strength',
    muscleGroup: ['Chest', 'Arms'],
    equipment: 'Barbell',
    sets: [],
    description: 'Lie on a decline bench, lower the barbell to your lower chest, then press it upward until your arms are extended.',
    imageUri: 'barbell bench press decline full hd.mp4'
  },
  {
    id: 'chest_fly',
    name: 'Cable Chest Fly',
    category: 'Strength',
    muscleGroup: ['Chest'],
    equipment: 'Machines',
    sets: [],
    description: 'Lie on a flat bench with dumbbells, open your arms wide with a slight bend in the elbows, and bring the weights together above your chest.',
    imageUri: 'Band Chest Fly_female_1.mp4'
  },
  {
    id: 'push_ups',
    name: 'Push-Ups',
    category: 'Strength',
    muscleGroup: ['Chest', 'Arms', 'Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Start in a plank position, lower your body until your chest nearly touches the floor, then push back up.',
    imageUri: undefined
  },
  {
    id: 'dumbbell_flyes',
    name: 'Dumbbell Flyes',
    category: 'Strength',
    muscleGroup: ['Chest'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Lie on a flat bench with a dumbbell in each hand, open your arms wide in a wide arc, and bring the weights together above your chest.',
    imageUri: 'Dumbbell Fly.mp4'
  },
  {
    id: 'chest_dips',
    name: 'Chest Dips',
    category: 'Strength',
    muscleGroup: ['Chest', 'Arms'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Using parallel bars, lower your body by bending your elbows until your shoulders are below your elbows, then push back up to the starting position.',
    imageUri: 'chest dip full hd.mp4'
  },

  // ✅ Back Exercises
  {
    id: 'pull_ups',
    name: 'Pull-Ups',
    category: 'Strength',
    muscleGroup: ['Back', 'Arms'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Grab the pull-up bar with an overhand grip, pull your body up until your chin passes the bar, then lower back down slowly.',
    imageUri: 'pull up normal grip full hd.mp4'
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    category: 'Strength',
    muscleGroup: ['Back', 'Legs'],
    equipment: 'Barbell',
    sets: [],
    description: 'Stand with your feet hip-width apart, bend at the hips and knees, grip the barbell, and lift it by straightening your legs and back.',
    imageUri: 'Barbell deadlifts.mp4'
  },
  {
    id: 'bent_over_rows',
    name: 'Bent-Over Rows',
    category: 'Strength',
    muscleGroup: ['Back'],
    equipment: 'Barbell',
    sets: [],
    description: 'Bend at the waist with a slight knee bend, pull the barbell towards your lower chest, then lower it back down.',
    imageUri: 'Bent-over Row with bar.mp4'
  },
  {
    id: 'lat_pulldown',
    name: 'Lat Pulldown',
    category: 'Strength',
    muscleGroup: ['Back'],
    equipment: 'Machines',
    sets: [],
    description: 'Sit at the lat pulldown machine, grip the bar wider than shoulder-width, pull the bar down to your chest, and slowly release it upward.',
    imageUri: 'lat pull down normal grip full hd.mp4'
  },
  {
    id: 'seated_rows',
    name: 'Seated Rows',
    category: 'Strength',
    muscleGroup: ['Back'],
    equipment: 'Machines',
    sets: [],
    description: 'Sit at the row machine, grab the handles, pull them towards your torso while squeezing your shoulder blades, and then release slowly.',
    imageUri: 'seated normal grip row machine full hd.mp4'
  },
  {
    id: 't_bar_rows',
    name: 'T-Bar Rows',
    category: 'Strength',
    muscleGroup: ['Back'],
    equipment: 'Barbell',
    sets: [],
    description: 'Straddle the T-bar, grab the handles, and row the weight towards your chest while keeping your back straight.',
    imageUri: undefined
  },
  {
    id: 'single_arm_dumbbell_rows',
    name: 'Single-Arm Dumbbell Rows',
    category: 'Strength',
    muscleGroup: ['Back'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Place one knee and hand on a bench for support, row a dumbbell towards your hip, then lower it back down.',
    imageUri: 'dumbell single arm row right full hd.mp4'
  },

  // ✅ Shoulder Exercises
  {
    id: 'overhead_press',
    name: 'Overhead Press',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Barbell',
    sets: [],
    description: 'Stand with feet shoulder-width apart, press the barbell overhead until your arms are fully extended, then lower it back to shoulder height.',
    imageUri: 'Barbell seated overhead press.mp4'
  },
  {
    id: 'dumbbell_lateral_raises',
    name: 'Dumbbell Lateral Raises',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Stand with a dumbbell in each hand, raise them out to the sides until shoulder height, then lower them slowly.',
    imageUri: undefined
  },
  {
    id: 'front_raises',
    name: 'Front Raises',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Hold a dumbbell in each hand in front of your thighs, lift them straight in front of you to shoulder height, then lower them back down.',
    imageUri: 'front raises barbell full hd.mp4'
  },
  {
    id: 'rear_delt_flyes',
    name: 'Rear Delt Flyes',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Bend forward at the waist with dumbbells in hand, lift them out to the sides while squeezing your shoulder blades together, then lower them slowly.',
    imageUri: 'prone rear delt fly full hd.mp4'
  },
  {
    id: 'shrugs',
    name: 'Shrugs',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Hold dumbbells at your sides, shrug your shoulders upward towards your ears, then lower them back down.',
    imageUri: 'dumbell shrugs full hd.mp4'
  },
  {
    id: 'arnold_press',
    name: 'Arnold Press',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Start with dumbbells in front of your shoulders, palms facing you, then rotate your palms outward as you press the weights overhead. Reverse the motion on the way down.',
    imageUri: 'arnold press dumbell full hd.mp4'
  },
  {
    id: 'upright_rows',
    name: 'Upright Rows',
    category: 'Strength',
    muscleGroup: ['Shoulders'],
    equipment: 'Barbell',
    sets: [],
    description: 'Hold a barbell with an overhand grip, pull it straight up towards your chin by raising your elbows, then lower it slowly.',
    imageUri: 'upright row dumbell full hd.mp4'
  },

  // ✅ Arm Exercises
  {
    id: 'barbell_curls',
    name: 'Barbell Curls',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Barbell',
    sets: [],
    description: 'Stand with a barbell in your hands, curl the bar upward by contracting your biceps, then lower it back down with control.',
    imageUri: 'Barbell Curl_female_1.mp4'
  },
  {
    id: 'dumbbell_curls',
    name: 'Dumbbell Curls',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Hold a dumbbell in each hand, curl them upward focusing on your biceps, and lower them back down slowly.',
    imageUri: 'dumbell curls full hd.mp4'
  },
  {
    id: 'hammer_curls',
    name: 'Hammer Curls',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Hold dumbbells with a neutral grip (palms facing each other), curl them upward while keeping your elbows stationary, and lower them back down.',
    imageUri: 'Dumbbell Hammer Curl.mp4'
  },
  {
    id: 'preacher_curls',
    name: 'Preacher Curls',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Barbell',
    sets: [],
    description: 'Sit at a preacher bench, rest your arms on the pad, curl the barbell upward focusing on your biceps, and lower it slowly.',
    imageUri: 'Barbell preacher curl.mp4'
  },
  {
    id: 'tricep_dips',
    name: 'Tricep Dips',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Use parallel bars or a bench, lower your body by bending your elbows until you feel a stretch in your triceps, then push back up.',
    imageUri: 'bench triceps dip straight legs full hd.mp4'
  },
  {
    id: 'tricep_pushdowns',
    name: 'Tricep Pushdowns',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Machines',
    sets: [],
    description: 'Stand at a cable machine with a bar attachment, push the bar downward by extending your arms fully, then return with control.',
    imageUri: 'Cable Pushdown.mp4'
  },

  // ✅ Leg Exercises
  {
    id: 'squats',
    name: 'Squats',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Barbell',
    sets: [],
    description: 'Stand with your feet shoulder-width apart, lower your body by bending your knees and hips, and return to the starting position.',
    imageUri: 'barbell squats full hd.mp4'
  },
  {
    id: 'leg_press',
    name: 'Leg Press',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Machines',
    sets: [],
    description: 'Sit at a leg press machine, place your feet on the platform, push the weight upward until your legs are nearly straight, then lower the weight slowly.',
    imageUri: 'Leg press machine normal stance_1.mp4'
  },
  {
    id: 'lunges',
    name: 'Lunges',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Step forward with one leg, lower your body until both knees are bent at about 90 degrees, then push back to the starting position and repeat on the other side.',
    imageUri: 'dumbell lunges on the spot full hd.mp4'
  },
  {
    id: 'leg_extensions',
    name: 'Leg Extensions',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Machines',
    sets: [],
    description: 'Sit on a leg extension machine, hook your feet under the padded bar, extend your legs fully, and slowly return to the starting position.',
    imageUri: 'Lever Leg Extension_Female_1.mp4'
  },
  {
    id: 'leg_curls',
    name: 'Leg Curls',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Machines',
    sets: [],
    description: 'Lie face down on a leg curl machine, position your legs under the pad, curl your legs upward, and then lower them back down.',
    imageUri: 'Seated leg curl machine full hd.mp4'
  },
  {
    id: 'calf_raises',
    name: 'Calf Raises',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Stand on a raised surface with your heels hanging off, raise your heels by contracting your calf muscles, and lower them back down slowly.',
    imageUri: 'calf raises FULL HD.mp4'
  },

  // ✅ Core Exercises
  {
    id: 'crunches',
    name: 'Crunches',
    category: 'Strength',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Lie on your back with your knees bent and feet flat on the floor, lift your shoulders off the ground by contracting your abs, and lower back down.',
    imageUri: 'ab crunch full hd.mp4'
  },
  {
    id: 'russian_twists',
    name: 'Russian Twists',
    category: 'Strength',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Sit on the floor with your knees bent, lean back slightly, and twist your torso from side to side, optionally holding a weight.',
    imageUri: 'russian twist full hd.mp4'
  },
  {
    id: 'planks',
    name: 'Planks',
    category: 'Strength',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Assume a push-up position but rest on your forearms, keep your body in a straight line, and hold for the desired time.',
    imageUri: 'plank on elbows full hd.mp4'
  },
  {
    id: 'bicycle_crunches',
    name: 'Bicycle Crunches',
    category: 'Strength',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Lie on your back, alternate touching your elbows to the opposite knee in a cycling motion, and engage your abs throughout.',
    imageUri: 'bicycles crunches full hd.mp4'
  },
  {
    id: 'mountain_climbers',
    name: 'Mountain Climbers',
    category: 'Cardio',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Start in a push-up position, quickly drive your knees towards your chest one at a time, simulating a running motion while maintaining a strong core.',
    imageUri: 'mountain climbers full hd.mp4'
  },
  // NEWLY ADDED FEB 13, 2025
  {
    id: 'dumbbell_bench_press',
    name: 'Dumbbell Bench Press',
    category: 'Strength',
    muscleGroup: ['Chest', 'Arms'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Lie on a flat bench holding a dumbbell in each hand, press them upward until your arms are extended, then lower them slowly.',
    imageUri: 'Dumbbell Bench Press.mp4'
  },
  {
    id: 'machine_chest_press',
    name: 'Machine Chest Press',
    category: 'Strength',
    muscleGroup: ['Chest'],
    equipment: 'Machines',
    sets: [],
    description: 'Sit at the machine, push the handles forward until your arms are fully extended, then control the return.',
    imageUri: 'machine chest press flat full hd.mp4'
  },
  {
    id: 'machine_chest_fly',
    name: 'Machine Chest Fly',
    category: 'Strength',
    muscleGroup: ['Chest'],
    equipment: 'Machines',
    sets: [],
    description: 'Sit with your back against the pad, grip the handles at chest level, and bring them together with a slight bend in your elbows to contract your chest, then slowly return to the starting position.',
    imageUri: 'machine fly full hd.mp4'
  },
  {
    id: 'inverted_rows',
    name: 'Inverted Rows',
    category: 'Strength',
    muscleGroup: ['Back', 'Arms'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Position yourself under a bar, grip it with an overhand grip, pull your chest toward the bar, then lower yourself back down.',
    imageUri: 'inverted rows full hd.mp4'
  },
  {
    id: 'hyperextensions',
    name: 'Hyperextensions',
    category: 'Strength',
    muscleGroup: ['Back'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Lie face down on a bench, secure your feet, lift your upper body by contracting your lower back muscles, and slowly lower.',
    imageUri: '45 degree hyperextension (arms in front of chest)_female_1.mp4'
  },
  {
    id: 'face_pulls',
    name: 'Face Pulls',
    category: 'Strength',
    muscleGroup: ['Shoulders', 'Back'],
    equipment: 'Machines',
    sets: [],
    description: 'Using a rope attachment on a cable machine, pull the rope toward your face while keeping your elbows high, then extend back.',
    imageUri: 'resistance bands facepull full hd.mp4'
  },
  {
    id: 'dumbbell_shoulder_press',
    name: 'Dumbbell Shoulder Press',
    category: 'Strength',
    muscleGroup: ['Shoulders', 'Arms'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Press dumbbells overhead from shoulder height until your arms are extended, then lower them back down with control.',
    imageUri: 'seated dumbbell shoulders press full hd.mp4'
  },
  {
    id: 'skull_crushers',
    name: 'Skull Crushers',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Barbell',
    sets: [],
    description: 'Lie on a bench with a barbell, lower the weight toward your forehead by bending your elbows, then extend back up.',
    imageUri: 'Barbell lying triceps skull crushers.mp4'
  },
  {
    id: 'concentration_curls',
    name: 'Concentration Curls',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Sit on a bench, rest your elbow on your thigh, curl the dumbbell upward focusing on your bicep, then lower it slowly.',
    imageUri: 'concentration curls dumbbell full hd.mp4'
  },
  {
    id: 'bulgarian_split_squats',
    name: 'Bulgarian Split Squats',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Stand a few feet in front of a bench, place one foot behind you on the bench, lower your body until your front thigh is parallel, then push up.',
    imageUri: 'Bulgarian Split Squat.mp4'
  },
  {
    id: 'glute_bridges',
    name: 'Glute Bridges',
    category: 'Strength',
    muscleGroup: ['Legs', 'Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Lie on your back with knees bent, lift your hips by contracting your glutes and hamstrings, then lower back down slowly.',
    imageUri: 'Glute Bridge with Abduction bodyweight full hd.mp4'
  },
  {
    id: 'barbell_wrist_curl',
    name: 'Barbell Wrist Curl',
    category: 'Arms',
    muscleGroup: ['Forearms'],
    equipment: 'Barbell',
    sets: [],
    description: 'Sit on a bench with forearms resting on your thighs, palms facing up, and curl the barbell upward using only your wrists, then lower slowly.',
    imageUri: undefined
  },
  {
    id: 'dumbbell_wrist_curl',
    name: 'Dumbbell Wrist Curl',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Sit on a bench with forearms resting on your thighs, palms facing up, and curl the dumbbells upward using only your wrists, then lower slowly.',
    imageUri: undefined
  },
  {
    id: 'hip_thrusts',
    name: 'Hip Thrusts',
    category: 'Strength',
    muscleGroup: ['Legs'],
    equipment: 'Barbell',
    sets: [],
    description: 'Sit on the ground with your upper back against a bench, place a barbell over your hips, thrust upward by engaging your glutes, then lower with control.',
    imageUri: 'Dumbbell Hip Thrust.mp4'
  },
  {
    id: 'sumo_deadlift',
    name: 'Sumo Deadlift',
    category: 'Strength',
    muscleGroup: ['Legs', 'Back'],
    equipment: 'Barbell',
    sets: [],
    description: 'Adopt a wide stance with toes pointed outward, grip the bar inside your knees, lift by extending your legs and back, then lower it back down.',
    imageUri: 'Barbell sumo deadlift.mp4'
  },
  {
    id: 'side_planks',
    name: 'Side Planks',
    category: 'Strength',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Lie on your side, prop yourself up on your forearm, lift your hips to create a straight line, and hold for the desired duration.',
    imageUri: 'side plank full hd.mp4'
  },
  {
    id: 'leg_raises',
    name: 'Leg Raises',
    category: 'Strength',
    muscleGroup: ['Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Lie on your back with legs straight, lift them until they are perpendicular to the floor, and slowly lower them back down.',
    imageUri: 'lyinng leg raise full hd.mp4'
  },
  {
    id: 'burpees',
    name: 'Burpees',
    category: 'Cardio',
    muscleGroup: ['Chest', 'Arms', 'Legs', 'Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'From a standing position, drop into a squat, kick your feet back into a push-up, perform a push-up, return to squat, and jump up explosively.',
    imageUri: 'Burpee.mp4'
  },
  {
    id: 'jumping_jacks',
    name: 'Jumping Jacks',
    category: 'Cardio',
    muscleGroup: ['Legs', 'Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Stand upright, jump while spreading your legs and raising your arms overhead, then return to the starting position.',
    imageUri: 'jumping jack full hd.mp4'
  },
  {
    id: 'box_jumps',
    name: 'Box Jumps',
    category: 'Cardio',
    muscleGroup: ['Legs', 'Core'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Stand in front of a sturdy box, jump onto it landing softly on both feet, then step or jump back down.',
    imageUri: 'box jump full hd.mp4'
  },
  {
    id: 'medicine_ball_slams',
    name: 'Medicine Ball Slams',
    category: 'Strength',
    muscleGroup: ['Arms', 'Core'],
    equipment: 'Medicine Ball',
    sets: [],
    description: 'Raise a medicine ball overhead, then slam it forcefully to the ground while engaging your core, and repeat.',
    imageUri: 'Ball Slams_1.mp4'
  },
  {
    id: 'farmers_walk',
    name: "Farmer's Walk",
    category: 'Strength',
    muscleGroup: ['Arms', 'Legs', 'Core'],
    equipment: 'Dumbbells',
    sets: [],
    description: 'Hold a heavy dumbbell in each hand and walk a set distance while keeping your back straight and core engaged.',
    imageUri: 'Dumbell Farmer walks full hd.mp4'
  },
  // New 03/08/25
  {
    id: 'high_knees',
    name: "High Knees",
    category: 'Cardio',
    muscleGroup: ['Legs'],
    equipment: 'Bodyweight',
    sets: [],
    description: 'Stand in place and alternate raising your knees to your hips.',
    imageUri: ''
  },
  {
    id: 'wrist_roller',
    name: 'Wrist Roller',
    category: 'Strength',
    muscleGroup: ['Arms'],
    equipment: 'Other', // Assuming 'Other' is a valid equipment type for this
    sets: [],
    description: 'Hold a wrist roller with a weight attached by a rope, and twist your wrists to roll the weight up and down the rope.',
    imageUri: undefined
  },
];


export const validatePredefinedExercises = () => {
  for (const exercise of predefinedExercises) {
    if (!VALID_CATEGORIES.includes(exercise.category)) {
      console.warn(`Invalid category: ${exercise.category} in ${exercise.name}`);
    }
    if (!exercise.muscleGroup.every((mg: any) => VALID_MUSCLE_GROUPS.includes(mg))) {
      console.warn(`Invalid muscle group(s) in ${exercise.name}:`, exercise.muscleGroup);
    }
    if (!VALID_EQUIPMENT.includes(exercise.equipment)) {
      console.warn(`Invalid equipment: ${exercise.equipment} in ${exercise.name}`);
    }
  }
};

validatePredefinedExercises();
