import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import grammar, {
	DatetimeSemantics,
} from "@/providers/datetime/Datetime.ohm-bundle";
import {
	dayOfWeekToIndex,
	getNextDayOfWeek,
	getPreviousDayOfWeek,
} from "@/utilities/Datetime";
import moment from "moment";

export class DatetimeProvider extends BaseSolveProvider {
	name: string = "DatetimeProvider";
	private semantics: DatetimeSemantics;

	constructor() {
		super();

		this.semantics = grammar.createSemantics();

		this.semantics.addOperation<moment.Moment | string | number>("eval()", {
			Addition(datetimeNode, _, timespanNode) {
				const datetime = datetimeNode.eval();

				const timespanNumber = parseInt(
					timespanNode.child(0).sourceString
				);

				const timespanUnit = timespanNode.child(1).sourceString;

				return datetime.add(timespanNumber, timespanUnit);
			},
			Subtraction(datetimeNode, _, timespanNode) {
				const datetime = datetimeNode.eval();

				const timespanNumber = parseInt(
					timespanNode.child(0).sourceString
				);

				const timespanUnit = timespanNode.child(1).sourceString;

				return datetime.subtract(timespanNumber, timespanUnit);
			},
			Primitive(node) {
				return node.eval();
			},
			Now(_) {
				return moment();
			},
			Today(_) {
				return moment().startOf("day");
			},
			Tomorrow(_) {
				return moment().add(1, "day").startOf("day");
			},
			Yesterday(_) {
				return moment().subtract(1, "day").startOf("day");
			},
			Datetime(dOrM, _2, mOrD, _4, year, time) {
				const dateString = `${dOrM.sourceString}/${mOrD.sourceString}/${year.sourceString} ${time.sourceString}`;

				return moment(dateString, [
					"DD/MM/YYYY HH:mm:ss",
					"YYYY/MM/DD HH:mm:ss",
				]);
			},
			NextDayOfWeek(_, dayOfWeekNode) {
				const dayOfWeek = dayOfWeekNode.sourceString.toLowerCase();

				const nextDayOfWeekIndex = dayOfWeekToIndex(dayOfWeek);

				return getNextDayOfWeek(nextDayOfWeekIndex);
			},
			LastDayOfWeek(_, dayOfWeekNode) {
				const dayOfWeek = dayOfWeekNode.sourceString.toLowerCase();

				const previousDayOfWeekIndex = dayOfWeekToIndex(dayOfWeek);

				return getPreviousDayOfWeek(previousDayOfWeekIndex);
			},
			TimeUnitSinceDate(unitNode, _, dateNode) {
				const date = dateNode.eval();

				const timeUntil = moment().startOf("day").diff(
					date,
					// @ts-expect-error
					unitNode.sourceString
				);

				return `${Math.max(timeUntil, 0)} ${unitNode.sourceString}`;
			},
			TimeUnitUntilDate(unitNode, _, dateNode) {
				const date = dateNode.eval();

				const timeUntil = date.diff(
					moment().startOf("day"),
					unitNode.sourceString
				);

				return `${Math.max(timeUntil, 0)} ${unitNode.sourceString}`;
			},
			integer(_) {
				return parseInt(this.sourceString);
			},
			number(_) {
				return parseFloat(this.sourceString);
			},
		});
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const matchResult = grammar.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).eval();

			// if (moment.isMoment(result)) {
			// 	console.log("IT'S A MOMENT OBJECT");
			// }

			return result;
		} catch (e) {
			return undefined;
		}
	}
}
