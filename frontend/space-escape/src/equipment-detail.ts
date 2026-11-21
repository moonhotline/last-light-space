import { Group } from "three";
import { equipmentModel } from "./equipment-model";
import { finish, machinedRing, mergeMachinedParts } from "./machined-detail";

export function detailRifle(source: Group) {
  const model = equipmentModel(source, 1.12);
  model.name = "hmg-379-precision";
  const steel = finish(0x506777, .84, .36);
  const titanium = finish(0x6d7c82, .79, .31);
  const black = finish(0x151d23, .59, .42);
  const glass = finish(0x12353e, .42, .17, 0x11586b);

  const shroud = machinedRing([
    [.041, 0], [.048, .006], [.049, .018], [.046, .025], [.044, .045],
    [.044, .104], [.049, .117], [.049, .128], [.044, .141], [.034, .144],
    [.025, .141], [.022, .136], [.024, .117], [.029, .021], [.038, 0], [.041, 0],
  ], 128, 7).translate(.08, .094, -.481);
  const bore = machinedRing([
    [.023, 0], [.024, .015], [.024, .034], [.022, .048], [.018, .049],
    [.015, .044], [.015, .012], [.018, 0], [.023, 0],
  ], 112, 7).translate(.08, .094, -.581);
  const lensShade = machinedRing([
    [.028, 0], [.032, .006], [.033, .018], [.033, .031], [.030, .042],
    [.026, .042], [.023, .037], [.023, .018], [.025, 0], [.028, 0],
  ], 112, 6).rotateY(Math.PI).translate(.078, .193, .086);
  const sight = machinedRing([
    [.001, 0], [.012, -.003], [.021, -.009], [.024, -.012], [.024, -.016],
    [.021, -.019], [.001, -.019],
  ], 96, 5).rotateY(Math.PI).translate(.078, .193, .125);
  const fins = Array.from({ length: 6 }, (_, i) => machinedRing([
    [.042, 0], [.047, .001], [.050, .003], [.050, .005], [.047, .007], [.042, .008], [.042, 0],
  ], 104, 5).translate(.08, .094, -.506 - i * .012));

  model.add(
    mergeMachinedParts("barrel_shroud", [shroud], steel),
    mergeMachinedParts("dark_bore", [bore, lensShade], black),
    mergeMachinedParts("heat_dissipation_rings", fins, titanium),
    mergeMachinedParts("rear_sight_lens", [sight], glass),
  );
  return model;
}
