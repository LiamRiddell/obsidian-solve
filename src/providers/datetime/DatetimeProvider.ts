import { EDatetimeParsingFormat } from "@/constants/EDatetimeFormat";
import grammar, {
	DatetimeSemantics,
} from "@/grammars/datetime/Datetime.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { DatetimeResult } from "@/results/DatetimeResult";
import { StringResult } from "@/results/StringResult";
import UserSettings from "@/settings/UserSettings";
import {
	dayOfWeekToIndex,
	getNextDayOfWeek,
	getPreviousDayOfWeek,
} from "@/utilities/Datetime";
import moment from "moment";

export class DatetimeProvider extends SemanticProviderBase<DatetimeSemantics> {
	constructor() {
		super("DatetimeProvider");

		this.semantics = grammar.createSemantics();

		this.semantics.addOperation<DatetimeResult | StringResult | number>(
			"visit()",
			{
				Addition(datetimeNode, _, timespanNode) {
					const datetime = datetimeNode.visit();

					const timespanNumber = parseInt(
						timespanNode.child(0).sourceString
					);

					const timespanUnit = timespanNode.child(1).sourceString;

					return new DatetimeResult(
						datetime.value.add(timespanNumber, timespanUnit)
					);
				},
				Subtraction(datetimeNode, _, timespanNode) {
					const datetime = datetimeNode.visit();

					const timespanNumber = parseInt(
						timespanNode.child(0).sourceString
					);

					const timespanUnit = timespanNode.child(1).sourceString;

					return new DatetimeResult(
						datetime.value.subtract(timespanNumber, timespanUnit)
					);
				},
				Primitive(node) {
					return node.visit();
				},
				Now(_) {
					return new DatetimeResult(moment());
				},
				Today(_) {
					return new DatetimeResult(moment().startOf("day"));
				},
				Tomorrow(_) {
					return new DatetimeResult(
						moment().add(1, "day").startOf("day")
					);
				},
				Yesterday(_) {
					return new DatetimeResult(
						moment().subtract(1, "day").startOf("day")
					);
				},
				NextDayOfWeek(_, dayOfWeekNode) {
					const dayOfWeek = dayOfWeekNode.sourceString.toLowerCase();

					const nextDayOfWeekIndex = dayOfWeekToIndex(dayOfWeek);

					return new DatetimeResult(
						getNextDayOfWeek(nextDayOfWeekIndex)
					);
				},
				LastDayOfWeek(_, dayOfWeekNode) {
					const dayOfWeek = dayOfWeekNode.sourceString.toLowerCase();

					const previousDayOfWeekIndex = dayOfWeekToIndex(dayOfWeek);

					return new DatetimeResult(
						getPreviousDayOfWeek(previousDayOfWeekIndex)
					);
				},
				TimeUnitSinceDate(unitNode, _, dateNode) {
					const date = dateNode.visit();

					const timeUntil = moment().startOf("day").diff(
						date.value,
						// @ts-expect-error
						unitNode.sourceString
					);

					return new StringResult(
						`${Math.max(timeUntil, 0)} ${unitNode.sourceString}`
					);
				},
				TimeUnitUntilDate(unitNode, _, dateNode) {
					const date = dateNode.visit();

					const timeUntil = date.value.diff(
						moment().startOf("day"),
						unitNode.sourceString
					);

					return new StringResult(
						`${Math.max(timeUntil, 0)} ${unitNode.sourceString}`
					);
				},
				datetimeFormatIso(year, _, month, _1, day, time) {
					const dateString = `${year.sourceString}-${month.sourceString}-${day.sourceString} ${time.sourceString}`;
					return new DatetimeResult(
						moment(dateString, ["DD-MM-YYYY HH:mm:ss"])
					);
				},
				datetimeFormatEuropeanOrUs(dOrM, _, mOrD, _1, year, time) {
					const dateString = `${dOrM.sourceString}/${mOrD.sourceString}/${year.sourceString} ${time.sourceString}`;
					switch (
						UserSettings.getInstance().datetimeProvider
							.parsingFormat
					) {
						case EDatetimeParsingFormat.EU:
							return new DatetimeResult(
								moment(dateString, ["DD/MM/YYYY HH:mm:ss"])
							);

						case EDatetimeParsingFormat.US:
							return new DatetimeResult(
								moment(dateString, ["MM/DD/YYYY HH:mm:ss"])
							);
					}
				},
				integer(_) {
					return parseInt(this.sourceString);
				},
				number(_) {
					return parseFloat(this.sourceString);
				},
			}
		);
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const matchResult = grammar.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).visit();

			if (raw) {
				return result.value;
			}

			return result;
		} catch (e) {
			return undefined;
		}
	}
}
