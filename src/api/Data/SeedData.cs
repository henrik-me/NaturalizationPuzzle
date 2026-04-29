using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Data;

/// <summary>
/// Seeds the 128 USCIS civics-test questions, their answers, and the per-question
/// tag lists used by the Study-page tag filter.
///
/// <para>
/// Tagging policy (applies to <c>Question.Tags</c>):
/// </para>
/// <list type="bullet">
///   <item>
///     Tags use the form <c>"namespace:Value"</c> in seven namespaces — <c>people</c>,
///     <c>wars</c>, <c>documents</c>, <c>timePeriod</c>, <c>branches</c>,
///     <c>amendments</c>, and <c>civicConcepts</c>. Adding a new namespace is a
///     deliberate change and requires updating the client tag panel
///     (<c>NAMESPACE_LABELS</c> + <c>NAMESPACE_ORDER</c> in <c>TagFilterPanel.tsx</c>).
///   </item>
///   <item>
///     A <c>people</c>, <c>wars</c>, or <c>documents</c> tag is added only when the
///     subject is <em>named in the question text</em> or in the canonical USCIS
///     answer. We do not infer (e.g. Q94 "Lincoln" is tagged <c>people:Abraham
///     Lincoln</c> but is NOT tagged <c>wars:Civil War</c>, even though Lincoln
///     is a Civil War figure).
///   </item>
///   <item>
///     A <c>timePeriod</c> tag (<c>1700s</c>, <c>1800s</c>, <c>1900s</c>, <c>2000s</c>)
///     is added when the question is unambiguously about events in that century.
///     Questions about ongoing institutions (branches of government, voting rights,
///     symbols, holidays) are intentionally left without a time-period tag so the
///     filter is never accidentally noisy.
///   </item>
///   <item>
///     A <c>branches</c> tag (<c>Legislative</c>, <c>Executive</c>, <c>Judicial</c>)
///     is added when a question is structurally about that branch — its powers,
///     members, head, or internal mechanics. Meta questions about the branches as
///     a whole (Q15 "why three branches", Q16 "name them") get
///     <c>civicConcepts:Separation of Powers</c> instead of a specific branch tag.
///   </item>
///   <item>
///     An <c>amendments</c> tag is added when a specific amendment (or the Bill of
///     Rights) is named in the question text, OR when the question text explicitly
///     identifies a known set of amendments by their shared subject. Q63 ("four
///     amendments to the U.S. Constitution about who can vote") unambiguously refers
///     to the 15th, 19th, 24th, and 26th, so all four are tagged. We do NOT tag
///     voting-history questions like Q98 or Q102 where the canonical answer involves
///     an amendment but the question text neither names the amendment nor identifies
///     a set.
///   </item>
///   <item>
///     A <c>civicConcepts</c> tag is added only when the concept is the explicit
///     subject of the question (e.g. Q13 names "rule of law"; Q112 names "civil
///     rights movement"). We deliberately keep this namespace small to avoid
///     editorial drift.
///   </item>
/// </list>
///
/// <para>
/// The corresponding sentinel-set tests in
/// <c>tests/api/QuestionServiceTests.cs</c> pin a stable subset of question IDs
/// per tag, so an accidental seed deletion or rename surfaces as a failing test.
/// </para>
/// </summary>
public static class SeedData
{
    public static void Seed(ModelBuilder modelBuilder)
    {
        var designated6520 = new HashSet<int> { 1, 2, 6, 7, 14, 15, 18, 20, 21, 22, 24, 25, 36, 38, 52, 73, 76, 79, 119, 123 };

        modelBuilder.Entity<Question>().HasData(
            // American Government — Principles of American Government (Q1–14)
            new Question { Id = 1, Text = "What is the form of government of the United States?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = true, Tags = new List<string>() },
            new Question { Id = 2, Text = "What is the supreme law of the land?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = true, Tags = new List<string> { "documents:Constitution" } },
            new Question { Id = 3, Text = "Name one thing the U.S. Constitution does.", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Constitution" } },
            new Question { Id = 4, Text = "The U.S. Constitution starts with the words \"We the People.\" What does \"We the People\" mean?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Constitution" } },
            new Question { Id = 5, Text = "How are changes made to the U.S. Constitution?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Constitution" } },
            new Question { Id = 6, Text = "What does the Bill of Rights protect?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = true, Tags = new List<string> { "documents:Bill of Rights", "amendments:Bill of Rights" } },
            new Question { Id = 7, Text = "How many amendments does the U.S. Constitution have?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = true, Tags = new List<string> { "documents:Constitution" } },
            new Question { Id = 8, Text = "Why is the Declaration of Independence important?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Declaration of Independence" } },
            new Question { Id = 9, Text = "What founding document said the American colonies were free from Britain?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Declaration of Independence" } },
            new Question { Id = 10, Text = "Name two important ideas from the Declaration of Independence and the U.S. Constitution.", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Declaration of Independence", "documents:Constitution" } },
            new Question { Id = 11, Text = "The words \"Life, Liberty, and the pursuit of Happiness\" are in what founding document?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "documents:Declaration of Independence" } },
            new Question { Id = 12, Text = "What is the economic system of the United States?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 13, Text = "What is the rule of law?", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = false, Tags = new List<string> { "civicConcepts:Rule of Law" } },
            new Question { Id = 14, Text = "Many documents influenced the U.S. Constitution. Name one.", Category = "American Government", SubCategory = "Principles of American Government", Is6520Designated = true, Tags = new List<string> { "documents:Constitution" } },

            // American Government — System of Government (Q15–62)
            new Question { Id = 15, Text = "There are three branches of government. Why?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "civicConcepts:Separation of Powers" } },
            new Question { Id = 16, Text = "Name the three branches of government.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "civicConcepts:Separation of Powers" } },
            new Question { Id = 17, Text = "The President of the United States is in charge of which branch of government?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 18, Text = "What part of the federal government writes laws?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 19, Text = "What are the two parts of the U.S. Congress?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 20, Text = "Name one power of the U.S. Congress.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 21, Text = "How many U.S. senators are there?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 22, Text = "How long is a term for a U.S. senator?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 23, Text = "Who is one of your state's U.S. senators now?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 24, Text = "How many voting members are in the House of Representatives?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 25, Text = "How long is a term for a member of the House of Representatives?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 26, Text = "Why do U.S. representatives serve shorter terms than U.S. senators?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 27, Text = "How many senators does each state have?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 28, Text = "Why does each state have two senators?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 29, Text = "Name your U.S. representative.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 30, Text = "What is the name of the Speaker of the House of Representatives now?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 31, Text = "Who does a U.S. senator represent?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 32, Text = "Who elects U.S. senators?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 33, Text = "Who does a member of the House of Representatives represent?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 34, Text = "Who elects members of the House of Representatives?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 35, Text = "Some states have more representatives than other states. Why?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Legislative" } },
            new Question { Id = 36, Text = "The President of the United States is elected for how many years?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 37, Text = "The President of the United States can serve only two terms. Why?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 38, Text = "What is the name of the President of the United States now?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 39, Text = "What is the name of the Vice President of the United States now?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 40, Text = "If the president can no longer serve, who becomes president?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 41, Text = "Name one power of the president.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 42, Text = "Who is Commander in Chief of the U.S. military?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 43, Text = "Who signs bills to become laws?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 44, Text = "Who vetoes bills?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 45, Text = "Who appoints federal judges?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 46, Text = "The executive branch has many parts. Name one.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 47, Text = "What does the President's Cabinet do?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 48, Text = "What are two Cabinet-level positions?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 49, Text = "Why is the Electoral College important?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Executive" } },
            new Question { Id = 50, Text = "What is one part of the judicial branch?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 51, Text = "What does the judicial branch do?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 52, Text = "What is the highest court in the United States?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = true, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 53, Text = "How many seats are on the Supreme Court?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 54, Text = "How many Supreme Court justices are usually needed to decide a case?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 55, Text = "How long do Supreme Court justices serve?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 56, Text = "Supreme Court justices serve for life. Why?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 57, Text = "Who is the Chief Justice of the United States now?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "branches:Judicial" } },
            new Question { Id = 58, Text = "Name one power that is only for the federal government.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "civicConcepts:Federalism" } },
            new Question { Id = 59, Text = "Name one power that is only for the states.", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "civicConcepts:Federalism" } },
            new Question { Id = 60, Text = "What is the purpose of the 10th Amendment?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string> { "documents:Constitution", "amendments:10th Amendment", "civicConcepts:Federalism" } },
            new Question { Id = 61, Text = "Who is the governor of your state now?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 62, Text = "What is the capital of your state?", Category = "American Government", SubCategory = "System of Government", Is6520Designated = false, Tags = new List<string>() },

            // American Government — Rights and Responsibilities (Q63–72)
            new Question { Id = 63, Text = "There are four amendments to the U.S. Constitution about who can vote. Describe one of them.", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string> { "documents:Constitution", "amendments:15th Amendment", "amendments:19th Amendment", "amendments:24th Amendment", "amendments:26th Amendment" } },
            new Question { Id = 64, Text = "Who can vote in federal elections, run for federal office, and serve on a jury in the United States?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 65, Text = "What are three rights of everyone living in the United States?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 66, Text = "What do we show loyalty to when we say the Pledge of Allegiance?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 67, Text = "Name two promises that new citizens make in the Oath of Allegiance.", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 68, Text = "How can people become United States citizens?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 69, Text = "What are two examples of civic participation in the United States?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string> { "civicConcepts:Civic Participation" } },
            new Question { Id = 70, Text = "What is one way Americans can serve their country?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string> { "civicConcepts:Civic Participation" } },
            new Question { Id = 71, Text = "Why is it important to pay federal taxes?", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 72, Text = "It is important for all men age 18 through 25 to register for the Selective Service. Name one reason why.", Category = "American Government", SubCategory = "Rights and Responsibilities", Is6520Designated = false, Tags = new List<string>() },

            // American History — Colonial Period and Independence (Q73–89)
            new Question { Id = 73, Text = "The colonists came to America for many reasons. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = true, Tags = new List<string>() },
            new Question { Id = 74, Text = "Who lived in America before the Europeans arrived?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 75, Text = "What group of people was taken and sold as slaves?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 76, Text = "What war did the Americans fight to win independence from Britain?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = true, Tags = new List<string> { "wars:Revolutionary War", "timePeriod:1700s" } },
            new Question { Id = 77, Text = "Name one reason why the Americans declared independence from Britain.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 78, Text = "Who wrote the Declaration of Independence?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "documents:Declaration of Independence", "people:Thomas Jefferson", "timePeriod:1700s" } },
            new Question { Id = 79, Text = "When was the Declaration of Independence adopted?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = true, Tags = new List<string> { "documents:Declaration of Independence", "timePeriod:1700s" } },
            new Question { Id = 80, Text = "The American Revolution had many important events. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "wars:Revolutionary War", "timePeriod:1700s" } },
            new Question { Id = 81, Text = "There were 13 original states. Name five.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "timePeriod:1700s" } },
            new Question { Id = 82, Text = "What founding document was written in 1787?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "documents:Constitution", "timePeriod:1700s" } },
            new Question { Id = 83, Text = "The Federalist Papers supported the passage of the U.S. Constitution. Name one of the writers.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "documents:Federalist Papers", "timePeriod:1700s" } },
            new Question { Id = 84, Text = "Why were the Federalist Papers important?", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "documents:Federalist Papers", "timePeriod:1700s" } },
            new Question { Id = 85, Text = "Benjamin Franklin is famous for many things. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "people:Benjamin Franklin", "timePeriod:1700s" } },
            new Question { Id = 86, Text = "George Washington is famous for many things. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "people:George Washington", "timePeriod:1700s" } },
            new Question { Id = 87, Text = "Thomas Jefferson is famous for many things. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "people:Thomas Jefferson", "timePeriod:1700s" } },
            new Question { Id = 88, Text = "James Madison is famous for many things. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "people:James Madison", "timePeriod:1700s" } },
            new Question { Id = 89, Text = "Alexander Hamilton is famous for many things. Name one.", Category = "American History", SubCategory = "Colonial Period and Independence", Is6520Designated = false, Tags = new List<string> { "people:Alexander Hamilton", "timePeriod:1700s" } },

            // American History — The 1800s (Q90–99)
            new Question { Id = 90, Text = "What territory did the United States buy from France in 1803?", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "timePeriod:1800s" } },
            new Question { Id = 91, Text = "Name one war fought by the United States in the 1800s.", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "timePeriod:1800s" } },
            new Question { Id = 92, Text = "Name the U.S. war between the North and the South.", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "wars:Civil War", "timePeriod:1800s" } },
            new Question { Id = 93, Text = "The Civil War had many important events. Name one.", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "wars:Civil War", "timePeriod:1800s" } },
            new Question { Id = 94, Text = "Abraham Lincoln is famous for many things. Name one.", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "people:Abraham Lincoln", "timePeriod:1800s" } },
            new Question { Id = 95, Text = "What did the Emancipation Proclamation do?", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "documents:Emancipation Proclamation", "timePeriod:1800s" } },
            new Question { Id = 96, Text = "What U.S. war ended slavery?", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "wars:Civil War", "timePeriod:1800s" } },
            new Question { Id = 97, Text = "What amendment says all persons born or naturalized in the United States are U.S. citizens?", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "documents:Constitution", "timePeriod:1800s", "amendments:14th Amendment" } },
            new Question { Id = 98, Text = "When did all men get the right to vote?", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "timePeriod:1800s" } },
            new Question { Id = 99, Text = "Name one leader of the women's rights movement in the 1800s.", Category = "American History", SubCategory = "The 1800s", Is6520Designated = false, Tags = new List<string> { "timePeriod:1800s" } },

            // American History — Recent American History (Q100–118)
            new Question { Id = 100, Text = "Name one war fought by the United States in the 1900s.", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:1900s" } },
            new Question { Id = 101, Text = "Why did the United States enter World War I?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:World War I", "timePeriod:1900s" } },
            new Question { Id = 102, Text = "When did all women get the right to vote?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:1900s" } },
            new Question { Id = 103, Text = "What was the Great Depression?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:1900s" } },
            new Question { Id = 104, Text = "When did the Great Depression start?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:1900s" } },
            new Question { Id = 105, Text = "Who was president during the Great Depression and World War II?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:World War II", "timePeriod:1900s" } },
            new Question { Id = 106, Text = "Why did the United States enter World War II?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:World War II", "timePeriod:1900s" } },
            new Question { Id = 107, Text = "Dwight Eisenhower is famous for many things. Name one.", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "people:Dwight Eisenhower", "timePeriod:1900s" } },
            new Question { Id = 108, Text = "Who was the United States' main rival during the Cold War?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:Cold War", "timePeriod:1900s" } },
            new Question { Id = 109, Text = "During the Cold War, what was one main concern of the United States?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:Cold War", "timePeriod:1900s" } },
            new Question { Id = 110, Text = "Why did the United States enter the Korean War?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:Korean War", "timePeriod:1900s" } },
            new Question { Id = 111, Text = "Why did the United States enter the Vietnam War?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:Vietnam War", "timePeriod:1900s" } },
            new Question { Id = 112, Text = "What did the civil rights movement do?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:1900s", "civicConcepts:Civil Rights" } },
            new Question { Id = 113, Text = "Martin Luther King, Jr. is famous for many things. Name one.", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "people:Martin Luther King, Jr.", "timePeriod:1900s" } },
            new Question { Id = 114, Text = "Why did the United States enter the Persian Gulf War?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "wars:Persian Gulf War", "timePeriod:1900s" } },
            new Question { Id = 115, Text = "What major event happened on September 11, 2001 in the United States?", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:2000s" } },
            new Question { Id = 116, Text = "Name one U.S. military conflict after the September 11, 2001 attacks.", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string> { "timePeriod:2000s" } },
            new Question { Id = 117, Text = "Name one American Indian tribe in the United States.", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 118, Text = "Name one example of an American innovation.", Category = "American History", SubCategory = "Recent American History", Is6520Designated = false, Tags = new List<string>() },

            // Integrated Civics — Symbols and Holidays (Q119–128)
            new Question { Id = 119, Text = "What is the capital of the United States?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = true, Tags = new List<string>() },
            new Question { Id = 120, Text = "Where is the Statue of Liberty?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 121, Text = "Why does the flag have 13 stripes?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 122, Text = "Why does the flag have 50 stars?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 123, Text = "What is the name of the national anthem?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = true, Tags = new List<string>() },
            new Question { Id = 124, Text = "The Nation's first motto was \"E Pluribus Unum.\" What does that mean?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 125, Text = "What is Independence Day?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 126, Text = "Name three national U.S. holidays.", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 127, Text = "What is Memorial Day?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() },
            new Question { Id = 128, Text = "What is Veterans Day?", Category = "Integrated Civics", SubCategory = "Symbols and Holidays", Is6520Designated = false, Tags = new List<string>() }
        );

        modelBuilder.Entity<Answer>().HasData(
            // Q1 (IDs 1–3)
            new Answer { Id = 1, QuestionId = 1, Text = "Republic" },
            new Answer { Id = 2, QuestionId = 1, Text = "Constitution-based federal republic" },
            new Answer { Id = 3, QuestionId = 1, Text = "Representative democracy" },

            // Q2 (ID 4)
            new Answer { Id = 4, QuestionId = 2, Text = "(U.S.) Constitution" },

            // Q3 (IDs 5–8)
            new Answer { Id = 5, QuestionId = 3, Text = "Forms the government" },
            new Answer { Id = 6, QuestionId = 3, Text = "Defines powers of government" },
            new Answer { Id = 7, QuestionId = 3, Text = "Defines the parts of government" },
            new Answer { Id = 8, QuestionId = 3, Text = "Protects the rights of the people" },

            // Q4 (IDs 9–13)
            new Answer { Id = 9, QuestionId = 4, Text = "Self-government" },
            new Answer { Id = 10, QuestionId = 4, Text = "Popular sovereignty" },
            new Answer { Id = 11, QuestionId = 4, Text = "Consent of the governed" },
            new Answer { Id = 12, QuestionId = 4, Text = "People should govern themselves" },
            new Answer { Id = 13, QuestionId = 4, Text = "(Example of) social contract" },

            // Q5 (IDs 14–15)
            new Answer { Id = 14, QuestionId = 5, Text = "Amendments" },
            new Answer { Id = 15, QuestionId = 5, Text = "The amendment process" },

            // Q6 (IDs 16–17)
            new Answer { Id = 16, QuestionId = 6, Text = "(The basic) rights of Americans" },
            new Answer { Id = 17, QuestionId = 6, Text = "(The basic) rights of people living in the United States" },

            // Q7 (ID 18)
            new Answer { Id = 18, QuestionId = 7, Text = "Twenty-seven (27)" },

            // Q8 (IDs 19–22)
            new Answer { Id = 19, QuestionId = 8, Text = "It says America is free from British control." },
            new Answer { Id = 20, QuestionId = 8, Text = "It says all people are created equal." },
            new Answer { Id = 21, QuestionId = 8, Text = "It identifies inherent rights." },
            new Answer { Id = 22, QuestionId = 8, Text = "It identifies individual freedoms." },

            // Q9 (ID 23)
            new Answer { Id = 23, QuestionId = 9, Text = "Declaration of Independence" },

            // Q10 (IDs 24–29)
            new Answer { Id = 24, QuestionId = 10, Text = "Equality" },
            new Answer { Id = 25, QuestionId = 10, Text = "Liberty" },
            new Answer { Id = 26, QuestionId = 10, Text = "Social contract" },
            new Answer { Id = 27, QuestionId = 10, Text = "Natural rights" },
            new Answer { Id = 28, QuestionId = 10, Text = "Limited government" },
            new Answer { Id = 29, QuestionId = 10, Text = "Self-government" },

            // Q11 (ID 30)
            new Answer { Id = 30, QuestionId = 11, Text = "Declaration of Independence" },

            // Q12 (IDs 31–32)
            new Answer { Id = 31, QuestionId = 12, Text = "Capitalism" },
            new Answer { Id = 32, QuestionId = 12, Text = "Free market economy" },

            // Q13 (IDs 33–36)
            new Answer { Id = 33, QuestionId = 13, Text = "Everyone must follow the law." },
            new Answer { Id = 34, QuestionId = 13, Text = "Leaders must obey the law." },
            new Answer { Id = 35, QuestionId = 13, Text = "Government must obey the law." },
            new Answer { Id = 36, QuestionId = 13, Text = "No one is above the law." },

            // Q14 (IDs 37–44)
            new Answer { Id = 37, QuestionId = 14, Text = "Declaration of Independence" },
            new Answer { Id = 38, QuestionId = 14, Text = "Articles of Confederation" },
            new Answer { Id = 39, QuestionId = 14, Text = "Federalist Papers" },
            new Answer { Id = 40, QuestionId = 14, Text = "Anti-Federalist Papers" },
            new Answer { Id = 41, QuestionId = 14, Text = "Virginia Declaration of Rights" },
            new Answer { Id = 42, QuestionId = 14, Text = "Fundamental Orders of Connecticut" },
            new Answer { Id = 43, QuestionId = 14, Text = "Mayflower Compact" },
            new Answer { Id = 44, QuestionId = 14, Text = "Iroquois Great Law of Peace" },

            // Q15 (IDs 45–47)
            new Answer { Id = 45, QuestionId = 15, Text = "So one part does not become too powerful" },
            new Answer { Id = 46, QuestionId = 15, Text = "Checks and balances" },
            new Answer { Id = 47, QuestionId = 15, Text = "Separation of powers" },

            // Q16 (IDs 48–49)
            new Answer { Id = 48, QuestionId = 16, Text = "Legislative, executive, and judicial" },
            new Answer { Id = 49, QuestionId = 16, Text = "Congress, president, and the courts" },

            // Q17 (ID 50)
            new Answer { Id = 50, QuestionId = 17, Text = "Executive branch" },

            // Q18 (IDs 51–53)
            new Answer { Id = 51, QuestionId = 18, Text = "(U.S.) Congress" },
            new Answer { Id = 52, QuestionId = 18, Text = "(U.S. or national) legislature" },
            new Answer { Id = 53, QuestionId = 18, Text = "Legislative branch" },

            // Q19 (ID 54)
            new Answer { Id = 54, QuestionId = 19, Text = "Senate and House (of Representatives)" },

            // Q20 (IDs 55–57)
            new Answer { Id = 55, QuestionId = 20, Text = "Writes laws" },
            new Answer { Id = 56, QuestionId = 20, Text = "Declares war" },
            new Answer { Id = 57, QuestionId = 20, Text = "Makes the federal budget" },

            // Q21 (ID 58)
            new Answer { Id = 58, QuestionId = 21, Text = "One hundred (100)" },

            // Q22 (ID 59)
            new Answer { Id = 59, QuestionId = 22, Text = "Six (6) years" },

            // Q23 — state-specific (ID 60)
            new Answer { Id = 60, QuestionId = 23, Text = "[Answers vary by state]", IsStateSpecific = true },

            // Q24 (ID 61)
            new Answer { Id = 61, QuestionId = 24, Text = "Four hundred thirty-five (435)" },

            // Q25 (ID 62)
            new Answer { Id = 62, QuestionId = 25, Text = "Two (2) years" },

            // Q26 (ID 63)
            new Answer { Id = 63, QuestionId = 26, Text = "To more closely follow public opinion" },

            // Q27 (ID 64)
            new Answer { Id = 64, QuestionId = 27, Text = "Two (2)" },

            // Q28 (IDs 65–66)
            new Answer { Id = 65, QuestionId = 28, Text = "Equal representation (for small states)" },
            new Answer { Id = 66, QuestionId = 28, Text = "The Great Compromise (Connecticut Compromise)" },

            // Q29 — state-specific (ID 67)
            new Answer { Id = 67, QuestionId = 29, Text = "[Answers vary by state]", IsStateSpecific = true },

            // Q30 (ID 68)
            new Answer { Id = 68, QuestionId = 30, Text = "Mike Johnson" },

            // Q31 (IDs 69–70)
            new Answer { Id = 69, QuestionId = 31, Text = "Citizens of their state" },
            new Answer { Id = 70, QuestionId = 31, Text = "People of their state" },

            // Q32 (ID 71)
            new Answer { Id = 71, QuestionId = 32, Text = "Citizens from their state" },

            // Q33 (IDs 72–75)
            new Answer { Id = 72, QuestionId = 33, Text = "Citizens in their (congressional) district" },
            new Answer { Id = 73, QuestionId = 33, Text = "Citizens in their district" },
            new Answer { Id = 74, QuestionId = 33, Text = "People from their (congressional) district" },
            new Answer { Id = 75, QuestionId = 33, Text = "People in their district" },

            // Q34 (ID 76)
            new Answer { Id = 76, QuestionId = 34, Text = "Citizens from their (congressional) district" },

            // Q35 (IDs 77–79)
            new Answer { Id = 77, QuestionId = 35, Text = "(Because of) the state's population" },
            new Answer { Id = 78, QuestionId = 35, Text = "(Because) they have more people" },
            new Answer { Id = 79, QuestionId = 35, Text = "(Because) some states have more people" },

            // Q36 (ID 80)
            new Answer { Id = 80, QuestionId = 36, Text = "Four (4) years" },

            // Q37 (IDs 81–82)
            new Answer { Id = 81, QuestionId = 37, Text = "(Because of) the 22nd Amendment" },
            new Answer { Id = 82, QuestionId = 37, Text = "To keep the president from becoming too powerful" },

            // Q38 (ID 83)
            new Answer { Id = 83, QuestionId = 38, Text = "Donald Trump" },

            // Q39 (ID 84)
            new Answer { Id = 84, QuestionId = 39, Text = "JD Vance" },

            // Q40 (ID 85)
            new Answer { Id = 85, QuestionId = 40, Text = "The Vice President (of the United States)" },

            // Q41 (IDs 86–91)
            new Answer { Id = 86, QuestionId = 41, Text = "Signs bills into law" },
            new Answer { Id = 87, QuestionId = 41, Text = "Vetoes bills" },
            new Answer { Id = 88, QuestionId = 41, Text = "Enforces laws" },
            new Answer { Id = 89, QuestionId = 41, Text = "Commander in Chief (of the military)" },
            new Answer { Id = 90, QuestionId = 41, Text = "Chief diplomat" },
            new Answer { Id = 91, QuestionId = 41, Text = "Appoints federal judges" },

            // Q42 (ID 92)
            new Answer { Id = 92, QuestionId = 42, Text = "The President (of the United States)" },

            // Q43 (ID 93)
            new Answer { Id = 93, QuestionId = 43, Text = "The President (of the United States)" },

            // Q44 (ID 94)
            new Answer { Id = 94, QuestionId = 44, Text = "The President (of the United States)" },

            // Q45 (ID 95)
            new Answer { Id = 95, QuestionId = 45, Text = "The President (of the United States)" },

            // Q46 (IDs 96–98)
            new Answer { Id = 96, QuestionId = 46, Text = "President (of the United States)" },
            new Answer { Id = 97, QuestionId = 46, Text = "Cabinet" },
            new Answer { Id = 98, QuestionId = 46, Text = "Federal departments and agencies" },

            // Q47 (ID 99)
            new Answer { Id = 99, QuestionId = 47, Text = "Advises the President (of the United States)" },

            // Q48 (IDs 100–115)
            new Answer { Id = 100, QuestionId = 48, Text = "Attorney General" },
            new Answer { Id = 101, QuestionId = 48, Text = "Secretary of Agriculture" },
            new Answer { Id = 102, QuestionId = 48, Text = "Secretary of Commerce" },
            new Answer { Id = 103, QuestionId = 48, Text = "Secretary of Education" },
            new Answer { Id = 104, QuestionId = 48, Text = "Secretary of Energy" },
            new Answer { Id = 105, QuestionId = 48, Text = "Secretary of Health and Human Services" },
            new Answer { Id = 106, QuestionId = 48, Text = "Secretary of Homeland Security" },
            new Answer { Id = 107, QuestionId = 48, Text = "Secretary of Housing and Urban Development" },
            new Answer { Id = 108, QuestionId = 48, Text = "Secretary of the Interior" },
            new Answer { Id = 109, QuestionId = 48, Text = "Secretary of Labor" },
            new Answer { Id = 110, QuestionId = 48, Text = "Secretary of State" },
            new Answer { Id = 111, QuestionId = 48, Text = "Secretary of Transportation" },
            new Answer { Id = 112, QuestionId = 48, Text = "Secretary of the Treasury" },
            new Answer { Id = 113, QuestionId = 48, Text = "Secretary of Veterans Affairs" },
            new Answer { Id = 114, QuestionId = 48, Text = "Secretary of War" },
            new Answer { Id = 115, QuestionId = 48, Text = "Vice-President" },

            // Q49 (IDs 116–117)
            new Answer { Id = 116, QuestionId = 49, Text = "It decides who is elected president." },
            new Answer { Id = 117, QuestionId = 49, Text = "It provides a compromise between the popular election of the president and congressional selection." },

            // Q50 (IDs 118–119)
            new Answer { Id = 118, QuestionId = 50, Text = "Supreme Court" },
            new Answer { Id = 119, QuestionId = 50, Text = "Federal Courts" },

            // Q51 (IDs 120–123)
            new Answer { Id = 120, QuestionId = 51, Text = "Reviews laws" },
            new Answer { Id = 121, QuestionId = 51, Text = "Explains laws" },
            new Answer { Id = 122, QuestionId = 51, Text = "Resolves disputes (disagreements) about the law" },
            new Answer { Id = 123, QuestionId = 51, Text = "Decides if a law goes against the (U.S.) Constitution" },

            // Q52 (ID 124)
            new Answer { Id = 124, QuestionId = 52, Text = "Supreme Court" },

            // Q53 (ID 125)
            new Answer { Id = 125, QuestionId = 53, Text = "Nine (9)" },

            // Q54 (ID 126)
            new Answer { Id = 126, QuestionId = 54, Text = "Five (5)" },

            // Q55 (IDs 127–129)
            new Answer { Id = 127, QuestionId = 55, Text = "(For) life" },
            new Answer { Id = 128, QuestionId = 55, Text = "Lifetime appointment" },
            new Answer { Id = 129, QuestionId = 55, Text = "(Until) retirement" },

            // Q56 (IDs 130–131)
            new Answer { Id = 130, QuestionId = 56, Text = "To be independent (of politics)" },
            new Answer { Id = 131, QuestionId = 56, Text = "To limit outside (political) influence" },

            // Q57 (ID 132)
            new Answer { Id = 132, QuestionId = 57, Text = "John Roberts" },

            // Q58 (IDs 133–138)
            new Answer { Id = 133, QuestionId = 58, Text = "Print paper money" },
            new Answer { Id = 134, QuestionId = 58, Text = "Mint coins" },
            new Answer { Id = 135, QuestionId = 58, Text = "Declare war" },
            new Answer { Id = 136, QuestionId = 58, Text = "Create an army" },
            new Answer { Id = 137, QuestionId = 58, Text = "Make treaties" },
            new Answer { Id = 138, QuestionId = 58, Text = "Set foreign policy" },

            // Q59 (IDs 139–143)
            new Answer { Id = 139, QuestionId = 59, Text = "Provide schooling and education" },
            new Answer { Id = 140, QuestionId = 59, Text = "Provide protection (police)" },
            new Answer { Id = 141, QuestionId = 59, Text = "Provide safety (fire departments)" },
            new Answer { Id = 142, QuestionId = 59, Text = "Give a driver's license" },
            new Answer { Id = 143, QuestionId = 59, Text = "Approve zoning and land use" },

            // Q60 (ID 144)
            new Answer { Id = 144, QuestionId = 60, Text = "(It states that the) powers not given to the federal government belong to the states or to the people." },

            // Q61 — state-specific (ID 145)
            new Answer { Id = 145, QuestionId = 61, Text = "[Answers vary by state]", IsStateSpecific = true },

            // Q62 — state-specific (ID 146)
            new Answer { Id = 146, QuestionId = 62, Text = "[Answers vary by state]", IsStateSpecific = true },

            // Q63 (IDs 147–150)
            new Answer { Id = 147, QuestionId = 63, Text = "Citizens eighteen (18) and older (can vote)." },
            new Answer { Id = 148, QuestionId = 63, Text = "You don't have to pay (a poll tax) to vote." },
            new Answer { Id = 149, QuestionId = 63, Text = "Any citizen can vote. (Women and men can vote.)" },
            new Answer { Id = 150, QuestionId = 63, Text = "A male citizen of any race (can vote)." },

            // Q64 (IDs 151–153)
            new Answer { Id = 151, QuestionId = 64, Text = "Citizens" },
            new Answer { Id = 152, QuestionId = 64, Text = "Citizens of the United States" },
            new Answer { Id = 153, QuestionId = 64, Text = "U.S. citizens" },

            // Q65 (IDs 154–159)
            new Answer { Id = 154, QuestionId = 65, Text = "Freedom of expression" },
            new Answer { Id = 155, QuestionId = 65, Text = "Freedom of speech" },
            new Answer { Id = 156, QuestionId = 65, Text = "Freedom of assembly" },
            new Answer { Id = 157, QuestionId = 65, Text = "Freedom to petition the government" },
            new Answer { Id = 158, QuestionId = 65, Text = "Freedom of religion" },
            new Answer { Id = 159, QuestionId = 65, Text = "The right to bear arms" },

            // Q66 (IDs 160–161)
            new Answer { Id = 160, QuestionId = 66, Text = "The United States" },
            new Answer { Id = 161, QuestionId = 66, Text = "The flag" },

            // Q67 (IDs 162–167)
            new Answer { Id = 162, QuestionId = 67, Text = "Give up loyalty to other countries" },
            new Answer { Id = 163, QuestionId = 67, Text = "Defend the (U.S.) Constitution" },
            new Answer { Id = 164, QuestionId = 67, Text = "Obey the laws of the United States" },
            new Answer { Id = 165, QuestionId = 67, Text = "Serve in the military (if needed)" },
            new Answer { Id = 166, QuestionId = 67, Text = "Serve (help, do important work for) the nation (if needed)" },
            new Answer { Id = 167, QuestionId = 67, Text = "Be loyal to the United States" },

            // Q68 (IDs 168–170)
            new Answer { Id = 168, QuestionId = 68, Text = "Be born in the United States" },
            new Answer { Id = 169, QuestionId = 68, Text = "Naturalize" },
            new Answer { Id = 170, QuestionId = 68, Text = "Derive citizenship" },

            // Q69 (IDs 171–180)
            new Answer { Id = 171, QuestionId = 69, Text = "Vote" },
            new Answer { Id = 172, QuestionId = 69, Text = "Run for office" },
            new Answer { Id = 173, QuestionId = 69, Text = "Join a political party" },
            new Answer { Id = 174, QuestionId = 69, Text = "Help with a campaign" },
            new Answer { Id = 175, QuestionId = 69, Text = "Join a civic group" },
            new Answer { Id = 176, QuestionId = 69, Text = "Join a community group" },
            new Answer { Id = 177, QuestionId = 69, Text = "Give an elected official your opinion (on an issue)" },
            new Answer { Id = 178, QuestionId = 69, Text = "Contact elected officials" },
            new Answer { Id = 179, QuestionId = 69, Text = "Support or oppose an issue or policy" },
            new Answer { Id = 180, QuestionId = 69, Text = "Write to a newspaper" },

            // Q70 (IDs 181–186)
            new Answer { Id = 181, QuestionId = 70, Text = "Vote" },
            new Answer { Id = 182, QuestionId = 70, Text = "Pay taxes" },
            new Answer { Id = 183, QuestionId = 70, Text = "Obey the law" },
            new Answer { Id = 184, QuestionId = 70, Text = "Serve in the military" },
            new Answer { Id = 185, QuestionId = 70, Text = "Run for office" },
            new Answer { Id = 186, QuestionId = 70, Text = "Work for local, state, or federal government" },

            // Q71 (IDs 187–190)
            new Answer { Id = 187, QuestionId = 71, Text = "Required by law" },
            new Answer { Id = 188, QuestionId = 71, Text = "All people pay to fund the federal government" },
            new Answer { Id = 189, QuestionId = 71, Text = "Required by the (U.S.) Constitution (16th Amendment)" },
            new Answer { Id = 190, QuestionId = 71, Text = "Civic duty" },

            // Q72 (IDs 191–193)
            new Answer { Id = 191, QuestionId = 72, Text = "Required by law" },
            new Answer { Id = 192, QuestionId = 72, Text = "Civic duty" },
            new Answer { Id = 193, QuestionId = 72, Text = "Makes the draft fair, if needed" },

            // Q73 (IDs 194–198)
            new Answer { Id = 194, QuestionId = 73, Text = "Freedom" },
            new Answer { Id = 195, QuestionId = 73, Text = "Political liberty" },
            new Answer { Id = 196, QuestionId = 73, Text = "Religious freedom" },
            new Answer { Id = 197, QuestionId = 73, Text = "Economic opportunity" },
            new Answer { Id = 198, QuestionId = 73, Text = "Escape persecution" },

            // Q74 (IDs 199–200)
            new Answer { Id = 199, QuestionId = 74, Text = "American Indians" },
            new Answer { Id = 200, QuestionId = 74, Text = "Native Americans" },

            // Q75 (IDs 201–202)
            new Answer { Id = 201, QuestionId = 75, Text = "Africans" },
            new Answer { Id = 202, QuestionId = 75, Text = "People from Africa" },

            // Q76 (IDs 203–205)
            new Answer { Id = 203, QuestionId = 76, Text = "American Revolution" },
            new Answer { Id = 204, QuestionId = 76, Text = "The (American) Revolutionary War" },
            new Answer { Id = 205, QuestionId = 76, Text = "War for (American) Independence" },

            // Q77 (IDs 206–215)
            new Answer { Id = 206, QuestionId = 77, Text = "High taxes" },
            new Answer { Id = 207, QuestionId = 77, Text = "Taxation without representation" },
            new Answer { Id = 208, QuestionId = 77, Text = "British soldiers stayed in Americans' houses" },
            new Answer { Id = 209, QuestionId = 77, Text = "They did not have self-government" },
            new Answer { Id = 210, QuestionId = 77, Text = "Boston Massacre" },
            new Answer { Id = 211, QuestionId = 77, Text = "Boston Tea Party (Tea Act)" },
            new Answer { Id = 212, QuestionId = 77, Text = "Stamp Act" },
            new Answer { Id = 213, QuestionId = 77, Text = "Sugar Act" },
            new Answer { Id = 214, QuestionId = 77, Text = "Townshend Acts" },
            new Answer { Id = 215, QuestionId = 77, Text = "Intolerable (Coercive) Acts" },

            // Q78 (ID 216)
            new Answer { Id = 216, QuestionId = 78, Text = "(Thomas) Jefferson" },

            // Q79 (ID 217)
            new Answer { Id = 217, QuestionId = 79, Text = "July 4, 1776" },

            // Q80 (IDs 218–223)
            new Answer { Id = 218, QuestionId = 80, Text = "(Battle of) Bunker Hill" },
            new Answer { Id = 219, QuestionId = 80, Text = "Declaration of Independence" },
            new Answer { Id = 220, QuestionId = 80, Text = "Washington Crossing the Delaware (Battle of Trenton)" },
            new Answer { Id = 221, QuestionId = 80, Text = "(Battle of) Saratoga" },
            new Answer { Id = 222, QuestionId = 80, Text = "Valley Forge (Encampment)" },
            new Answer { Id = 223, QuestionId = 80, Text = "(Battle of) Yorktown (British surrender at Yorktown)" },

            // Q81 (IDs 224–236)
            new Answer { Id = 224, QuestionId = 81, Text = "New Hampshire" },
            new Answer { Id = 225, QuestionId = 81, Text = "Massachusetts" },
            new Answer { Id = 226, QuestionId = 81, Text = "Rhode Island" },
            new Answer { Id = 227, QuestionId = 81, Text = "Connecticut" },
            new Answer { Id = 228, QuestionId = 81, Text = "New York" },
            new Answer { Id = 229, QuestionId = 81, Text = "New Jersey" },
            new Answer { Id = 230, QuestionId = 81, Text = "Pennsylvania" },
            new Answer { Id = 231, QuestionId = 81, Text = "Delaware" },
            new Answer { Id = 232, QuestionId = 81, Text = "Maryland" },
            new Answer { Id = 233, QuestionId = 81, Text = "Virginia" },
            new Answer { Id = 234, QuestionId = 81, Text = "North Carolina" },
            new Answer { Id = 235, QuestionId = 81, Text = "South Carolina" },
            new Answer { Id = 236, QuestionId = 81, Text = "Georgia" },

            // Q82 (ID 237)
            new Answer { Id = 237, QuestionId = 82, Text = "(U.S.) Constitution" },

            // Q83 (IDs 238–241)
            new Answer { Id = 238, QuestionId = 83, Text = "(James) Madison" },
            new Answer { Id = 239, QuestionId = 83, Text = "(Alexander) Hamilton" },
            new Answer { Id = 240, QuestionId = 83, Text = "(John) Jay" },
            new Answer { Id = 241, QuestionId = 83, Text = "Publius" },

            // Q84 (IDs 242–243)
            new Answer { Id = 242, QuestionId = 84, Text = "They helped people understand the (U.S.) Constitution." },
            new Answer { Id = 243, QuestionId = 84, Text = "They supported passing the (U.S.) Constitution." },

            // Q85 (IDs 244–248)
            new Answer { Id = 244, QuestionId = 85, Text = "Founded the first free public libraries" },
            new Answer { Id = 245, QuestionId = 85, Text = "First Postmaster General of the United States" },
            new Answer { Id = 246, QuestionId = 85, Text = "Helped write the Declaration of Independence" },
            new Answer { Id = 247, QuestionId = 85, Text = "Inventor" },
            new Answer { Id = 248, QuestionId = 85, Text = "U.S. diplomat" },

            // Q86 (IDs 249–252)
            new Answer { Id = 249, QuestionId = 86, Text = "\"Father of Our Country\"" },
            new Answer { Id = 250, QuestionId = 86, Text = "First president of the United States" },
            new Answer { Id = 251, QuestionId = 86, Text = "General of the Continental Army" },
            new Answer { Id = 252, QuestionId = 86, Text = "President of the Constitutional Convention" },

            // Q87 (IDs 253–258)
            new Answer { Id = 253, QuestionId = 87, Text = "Writer of the Declaration of Independence" },
            new Answer { Id = 254, QuestionId = 87, Text = "Third president of the United States" },
            new Answer { Id = 255, QuestionId = 87, Text = "Doubled the size of the United States (Louisiana Purchase)" },
            new Answer { Id = 256, QuestionId = 87, Text = "First Secretary of State" },
            new Answer { Id = 257, QuestionId = 87, Text = "Founded the University of Virginia" },
            new Answer { Id = 258, QuestionId = 87, Text = "Writer of the Virginia Statute on Religious Freedom" },

            // Q88 (IDs 259–262)
            new Answer { Id = 259, QuestionId = 88, Text = "\"Father of the Constitution\"" },
            new Answer { Id = 260, QuestionId = 88, Text = "Fourth president of the United States" },
            new Answer { Id = 261, QuestionId = 88, Text = "President during the War of 1812" },
            new Answer { Id = 262, QuestionId = 88, Text = "One of the writers of the Federalist Papers" },

            // Q89 (IDs 263–267)
            new Answer { Id = 263, QuestionId = 89, Text = "First Secretary of the Treasury" },
            new Answer { Id = 264, QuestionId = 89, Text = "One of the writers of the Federalist Papers" },
            new Answer { Id = 265, QuestionId = 89, Text = "Helped establish the First Bank of the United States" },
            new Answer { Id = 266, QuestionId = 89, Text = "Aide to General George Washington" },
            new Answer { Id = 267, QuestionId = 89, Text = "Member of the Continental Congress" },

            // Q90 (IDs 268–269)
            new Answer { Id = 268, QuestionId = 90, Text = "Louisiana Territory" },
            new Answer { Id = 269, QuestionId = 90, Text = "Louisiana" },

            // Q91 (IDs 270–273)
            new Answer { Id = 270, QuestionId = 91, Text = "War of 1812" },
            new Answer { Id = 271, QuestionId = 91, Text = "Mexican-American War" },
            new Answer { Id = 272, QuestionId = 91, Text = "Civil War" },
            new Answer { Id = 273, QuestionId = 91, Text = "Spanish-American War" },

            // Q92 (ID 274)
            new Answer { Id = 274, QuestionId = 92, Text = "The Civil War" },

            // Q93 (IDs 275–282)
            new Answer { Id = 275, QuestionId = 93, Text = "(Battle of) Fort Sumter" },
            new Answer { Id = 276, QuestionId = 93, Text = "Emancipation Proclamation" },
            new Answer { Id = 277, QuestionId = 93, Text = "(Battle of) Vicksburg" },
            new Answer { Id = 278, QuestionId = 93, Text = "(Battle of) Gettysburg" },
            new Answer { Id = 279, QuestionId = 93, Text = "Sherman's March" },
            new Answer { Id = 280, QuestionId = 93, Text = "(Surrender at) Appomattox" },
            new Answer { Id = 281, QuestionId = 93, Text = "(Battle of) Antietam/Sharpsburg" },
            new Answer { Id = 282, QuestionId = 93, Text = "Lincoln was assassinated." },

            // Q94 (IDs 283–286)
            new Answer { Id = 283, QuestionId = 94, Text = "Freed the slaves (Emancipation Proclamation)" },
            new Answer { Id = 284, QuestionId = 94, Text = "Saved (or preserved) the Union" },
            new Answer { Id = 285, QuestionId = 94, Text = "Led the United States during the Civil War" },
            new Answer { Id = 286, QuestionId = 94, Text = "16th president of the United States" },

            // Q95 (IDs 287–290)
            new Answer { Id = 287, QuestionId = 95, Text = "Freed the slaves" },
            new Answer { Id = 288, QuestionId = 95, Text = "Freed slaves in the Confederacy" },
            new Answer { Id = 289, QuestionId = 95, Text = "Freed slaves in the Confederate states" },
            new Answer { Id = 290, QuestionId = 95, Text = "Freed slaves in most Southern states" },

            // Q96 (ID 291)
            new Answer { Id = 291, QuestionId = 96, Text = "The Civil War" },

            // Q97 (ID 292)
            new Answer { Id = 292, QuestionId = 97, Text = "14th Amendment" },

            // Q98 (IDs 293–296)
            new Answer { Id = 293, QuestionId = 98, Text = "After the Civil War" },
            new Answer { Id = 294, QuestionId = 98, Text = "During Reconstruction" },
            new Answer { Id = 295, QuestionId = 98, Text = "(With the) 15th Amendment" },
            new Answer { Id = 296, QuestionId = 98, Text = "1870" },

            // Q99 (IDs 297–302)
            new Answer { Id = 297, QuestionId = 99, Text = "Susan B. Anthony" },
            new Answer { Id = 298, QuestionId = 99, Text = "Elizabeth Cady Stanton" },
            new Answer { Id = 299, QuestionId = 99, Text = "Sojourner Truth" },
            new Answer { Id = 300, QuestionId = 99, Text = "Harriet Tubman" },
            new Answer { Id = 301, QuestionId = 99, Text = "Lucretia Mott" },
            new Answer { Id = 302, QuestionId = 99, Text = "Lucy Stone" },

            // Q100 (IDs 303–307)
            new Answer { Id = 303, QuestionId = 100, Text = "World War I" },
            new Answer { Id = 304, QuestionId = 100, Text = "World War II" },
            new Answer { Id = 305, QuestionId = 100, Text = "Korean War" },
            new Answer { Id = 306, QuestionId = 100, Text = "Vietnam War" },
            new Answer { Id = 307, QuestionId = 100, Text = "(Persian) Gulf War" },

            // Q101 (IDs 308–310)
            new Answer { Id = 308, QuestionId = 101, Text = "Because Germany attacked U.S. (civilian) ships" },
            new Answer { Id = 309, QuestionId = 101, Text = "To support the Allied Powers (England, France, Italy, and Russia)" },
            new Answer { Id = 310, QuestionId = 101, Text = "To oppose the Central Powers (Germany, Austria-Hungary, the Ottoman Empire, and Bulgaria)" },

            // Q102 (IDs 311–313)
            new Answer { Id = 311, QuestionId = 102, Text = "1920" },
            new Answer { Id = 312, QuestionId = 102, Text = "After World War I" },
            new Answer { Id = 313, QuestionId = 102, Text = "(With the) 19th Amendment" },

            // Q103 (ID 314)
            new Answer { Id = 314, QuestionId = 103, Text = "Longest economic recession in modern history" },

            // Q104 (IDs 315–316)
            new Answer { Id = 315, QuestionId = 104, Text = "The Great Crash (1929)" },
            new Answer { Id = 316, QuestionId = 104, Text = "Stock market crash of 1929" },

            // Q105 (ID 317)
            new Answer { Id = 317, QuestionId = 105, Text = "(Franklin) Roosevelt" },

            // Q106 (IDs 318–321)
            new Answer { Id = 318, QuestionId = 106, Text = "(Bombing of) Pearl Harbor" },
            new Answer { Id = 319, QuestionId = 106, Text = "Japanese attacked Pearl Harbor" },
            new Answer { Id = 320, QuestionId = 106, Text = "To support the Allied Powers (England, France, and Russia)" },
            new Answer { Id = 321, QuestionId = 106, Text = "To oppose the Axis Powers (Germany, Italy, and Japan)" },

            // Q107 (IDs 322–325)
            new Answer { Id = 322, QuestionId = 107, Text = "General during World War II" },
            new Answer { Id = 323, QuestionId = 107, Text = "President at the end of (during) the Korean War" },
            new Answer { Id = 324, QuestionId = 107, Text = "34th president of the United States" },
            new Answer { Id = 325, QuestionId = 107, Text = "Signed the Federal-Aid Highway Act of 1956 (Created the Interstate System)" },

            // Q108 (IDs 326–328)
            new Answer { Id = 326, QuestionId = 108, Text = "Soviet Union" },
            new Answer { Id = 327, QuestionId = 108, Text = "USSR" },
            new Answer { Id = 328, QuestionId = 108, Text = "Russia" },

            // Q109 (IDs 329–330)
            new Answer { Id = 329, QuestionId = 109, Text = "Communism" },
            new Answer { Id = 330, QuestionId = 109, Text = "Nuclear war" },

            // Q110 (ID 331)
            new Answer { Id = 331, QuestionId = 110, Text = "To stop the spread of communism" },

            // Q111 (ID 332)
            new Answer { Id = 332, QuestionId = 111, Text = "To stop the spread of communism" },

            // Q112 (ID 333)
            new Answer { Id = 333, QuestionId = 112, Text = "Fought to end racial discrimination" },

            // Q113 (IDs 334–335)
            new Answer { Id = 334, QuestionId = 113, Text = "Fought for civil rights" },
            new Answer { Id = 335, QuestionId = 113, Text = "Worked for equality for all Americans" },

            // Q114 (ID 336)
            new Answer { Id = 336, QuestionId = 114, Text = "To force the Iraqi military from Kuwait" },

            // Q115 (IDs 337–340)
            new Answer { Id = 337, QuestionId = 115, Text = "Terrorists attacked the United States" },
            new Answer { Id = 338, QuestionId = 115, Text = "Terrorists took over two planes and crashed them into the World Trade Center in New York City" },
            new Answer { Id = 339, QuestionId = 115, Text = "Terrorists took over a plane and crashed into the Pentagon in Arlington, Virginia" },
            new Answer { Id = 340, QuestionId = 115, Text = "Terrorists took over a plane originally aimed at Washington, D.C., and crashed in a field in Pennsylvania" },

            // Q116 (IDs 341–343)
            new Answer { Id = 341, QuestionId = 116, Text = "(Global) War on Terror" },
            new Answer { Id = 342, QuestionId = 116, Text = "War in Afghanistan" },
            new Answer { Id = 343, QuestionId = 116, Text = "War in Iraq" },

            // Q117 (IDs 344–368)
            new Answer { Id = 344, QuestionId = 117, Text = "Apache" },
            new Answer { Id = 345, QuestionId = 117, Text = "Blackfeet" },
            new Answer { Id = 346, QuestionId = 117, Text = "Cayuga" },
            new Answer { Id = 347, QuestionId = 117, Text = "Cherokee" },
            new Answer { Id = 348, QuestionId = 117, Text = "Cheyenne" },
            new Answer { Id = 349, QuestionId = 117, Text = "Chippewa" },
            new Answer { Id = 350, QuestionId = 117, Text = "Choctaw" },
            new Answer { Id = 351, QuestionId = 117, Text = "Creek" },
            new Answer { Id = 352, QuestionId = 117, Text = "Crow" },
            new Answer { Id = 353, QuestionId = 117, Text = "Hopi" },
            new Answer { Id = 354, QuestionId = 117, Text = "Huron" },
            new Answer { Id = 355, QuestionId = 117, Text = "Inupiat" },
            new Answer { Id = 356, QuestionId = 117, Text = "Lakota" },
            new Answer { Id = 357, QuestionId = 117, Text = "Mohawk" },
            new Answer { Id = 358, QuestionId = 117, Text = "Mohegan" },
            new Answer { Id = 359, QuestionId = 117, Text = "Navajo" },
            new Answer { Id = 360, QuestionId = 117, Text = "Oneida" },
            new Answer { Id = 361, QuestionId = 117, Text = "Onondaga" },
            new Answer { Id = 362, QuestionId = 117, Text = "Pueblo" },
            new Answer { Id = 363, QuestionId = 117, Text = "Seminole" },
            new Answer { Id = 364, QuestionId = 117, Text = "Seneca" },
            new Answer { Id = 365, QuestionId = 117, Text = "Shawnee" },
            new Answer { Id = 366, QuestionId = 117, Text = "Sioux" },
            new Answer { Id = 367, QuestionId = 117, Text = "Teton" },
            new Answer { Id = 368, QuestionId = 117, Text = "Tuscarora" },

            // Q118 (IDs 369–375)
            new Answer { Id = 369, QuestionId = 118, Text = "Light bulb" },
            new Answer { Id = 370, QuestionId = 118, Text = "Automobile (cars, internal combustion engine)" },
            new Answer { Id = 371, QuestionId = 118, Text = "Skyscrapers" },
            new Answer { Id = 372, QuestionId = 118, Text = "Airplane" },
            new Answer { Id = 373, QuestionId = 118, Text = "Assembly line" },
            new Answer { Id = 374, QuestionId = 118, Text = "Landing on the moon" },
            new Answer { Id = 375, QuestionId = 118, Text = "Integrated circuit (IC)" },

            // Q119 (ID 376)
            new Answer { Id = 376, QuestionId = 119, Text = "Washington, D.C." },

            // Q120 (IDs 377–378)
            new Answer { Id = 377, QuestionId = 120, Text = "New York (Harbor)" },
            new Answer { Id = 378, QuestionId = 120, Text = "Liberty Island" },

            // Q121 (IDs 379–380)
            new Answer { Id = 379, QuestionId = 121, Text = "(Because there were) 13 original colonies" },
            new Answer { Id = 380, QuestionId = 121, Text = "(Because the stripes) represent the original colonies" },

            // Q122 (IDs 381–383)
            new Answer { Id = 381, QuestionId = 122, Text = "(Because there is) one star for each state" },
            new Answer { Id = 382, QuestionId = 122, Text = "(Because) each star represents a state" },
            new Answer { Id = 383, QuestionId = 122, Text = "(Because there are) 50 states" },

            // Q123 (ID 384)
            new Answer { Id = 384, QuestionId = 123, Text = "The Star-Spangled Banner" },

            // Q124 (IDs 385–386)
            new Answer { Id = 385, QuestionId = 124, Text = "Out of many, one" },
            new Answer { Id = 386, QuestionId = 124, Text = "We all become one" },

            // Q125 (IDs 387–388)
            new Answer { Id = 387, QuestionId = 125, Text = "A holiday to celebrate U.S. independence (from Britain)" },
            new Answer { Id = 388, QuestionId = 125, Text = "The country's birthday" },

            // Q126 (IDs 389–398)
            new Answer { Id = 389, QuestionId = 126, Text = "New Year's Day" },
            new Answer { Id = 390, QuestionId = 126, Text = "Martin Luther King, Jr. Day" },
            new Answer { Id = 391, QuestionId = 126, Text = "Presidents Day (Washington's Birthday)" },
            new Answer { Id = 392, QuestionId = 126, Text = "Memorial Day" },
            new Answer { Id = 393, QuestionId = 126, Text = "Independence Day" },
            new Answer { Id = 394, QuestionId = 126, Text = "Labor Day" },
            new Answer { Id = 395, QuestionId = 126, Text = "Columbus Day" },
            new Answer { Id = 396, QuestionId = 126, Text = "Veterans Day" },
            new Answer { Id = 397, QuestionId = 126, Text = "Thanksgiving Day" },
            new Answer { Id = 398, QuestionId = 126, Text = "Christmas Day" },

            // Q127 (ID 399)
            new Answer { Id = 399, QuestionId = 127, Text = "A holiday to honor soldiers who died in military service" },

            // Q128 (IDs 400–401)
            new Answer { Id = 400, QuestionId = 128, Text = "A holiday to honor people in the (U.S.) military" },
            new Answer { Id = 401, QuestionId = 128, Text = "A holiday to honor people who have served (in the U.S. military)" }
        );

        modelBuilder.Entity<UsState>().HasData(
            new UsState { Id = 1, Name = "Alabama", Abbreviation = "AL", Capital = "Montgomery", Governor = "Kay Ivey", SenatorOne = "Tommy Tuberville", SenatorTwo = "Katie Britt", Representative = "Varies by district" },
            new UsState { Id = 2, Name = "Alaska", Abbreviation = "AK", Capital = "Juneau", Governor = "Mike Dunleavy", SenatorOne = "Lisa Murkowski", SenatorTwo = "Dan Sullivan", Representative = "Mary Peltola" },
            new UsState { Id = 3, Name = "Arizona", Abbreviation = "AZ", Capital = "Phoenix", Governor = "Katie Hobbs", SenatorOne = "Mark Kelly", SenatorTwo = "Ruben Gallego", Representative = "Varies by district" },
            new UsState { Id = 4, Name = "Arkansas", Abbreviation = "AR", Capital = "Little Rock", Governor = "Sarah Huckabee Sanders", SenatorOne = "John Boozman", SenatorTwo = "Tom Cotton", Representative = "Varies by district" },
            new UsState { Id = 5, Name = "California", Abbreviation = "CA", Capital = "Sacramento", Governor = "Gavin Newsom", SenatorOne = "Alex Padilla", SenatorTwo = "Adam Schiff", Representative = "Varies by district" },
            new UsState { Id = 6, Name = "Colorado", Abbreviation = "CO", Capital = "Denver", Governor = "Jared Polis", SenatorOne = "Michael Bennet", SenatorTwo = "John Hickenlooper", Representative = "Varies by district" },
            new UsState { Id = 7, Name = "Connecticut", Abbreviation = "CT", Capital = "Hartford", Governor = "Ned Lamont", SenatorOne = "Richard Blumenthal", SenatorTwo = "Chris Murphy", Representative = "Varies by district" },
            new UsState { Id = 8, Name = "Delaware", Abbreviation = "DE", Capital = "Dover", Governor = "Matt Meyer", SenatorOne = "Chris Coons", SenatorTwo = "Lisa Blunt Rochester", Representative = "Sarah McBride" },
            new UsState { Id = 9, Name = "Florida", Abbreviation = "FL", Capital = "Tallahassee", Governor = "Ron DeSantis", SenatorOne = "Rick Scott", SenatorTwo = "Ashley Moody", Representative = "Varies by district" },
            new UsState { Id = 10, Name = "Georgia", Abbreviation = "GA", Capital = "Atlanta", Governor = "Brian Kemp", SenatorOne = "Jon Ossoff", SenatorTwo = "Raphael Warnock", Representative = "Varies by district" },
            new UsState { Id = 11, Name = "Hawaii", Abbreviation = "HI", Capital = "Honolulu", Governor = "Josh Green", SenatorOne = "Brian Schatz", SenatorTwo = "Mazie Hirono", Representative = "Jill Tokuda" },
            new UsState { Id = 12, Name = "Idaho", Abbreviation = "ID", Capital = "Boise", Governor = "Brad Little", SenatorOne = "Mike Crapo", SenatorTwo = "Jim Risch", Representative = "Varies by district" },
            new UsState { Id = 13, Name = "Illinois", Abbreviation = "IL", Capital = "Springfield", Governor = "J.B. Pritzker", SenatorOne = "Dick Durbin", SenatorTwo = "Tammy Duckworth", Representative = "Varies by district" },
            new UsState { Id = 14, Name = "Indiana", Abbreviation = "IN", Capital = "Indianapolis", Governor = "Mike Braun", SenatorOne = "Todd Young", SenatorTwo = "Jim Banks", Representative = "Varies by district" },
            new UsState { Id = 15, Name = "Iowa", Abbreviation = "IA", Capital = "Des Moines", Governor = "Kim Reynolds", SenatorOne = "Chuck Grassley", SenatorTwo = "Joni Ernst", Representative = "Varies by district" },
            new UsState { Id = 16, Name = "Kansas", Abbreviation = "KS", Capital = "Topeka", Governor = "Laura Kelly", SenatorOne = "Jerry Moran", SenatorTwo = "Roger Marshall", Representative = "Varies by district" },
            new UsState { Id = 17, Name = "Kentucky", Abbreviation = "KY", Capital = "Frankfort", Governor = "Andy Beshear", SenatorOne = "Mitch McConnell", SenatorTwo = "Rand Paul", Representative = "Varies by district" },
            new UsState { Id = 18, Name = "Louisiana", Abbreviation = "LA", Capital = "Baton Rouge", Governor = "Jeff Landry", SenatorOne = "Bill Cassidy", SenatorTwo = "John Kennedy", Representative = "Varies by district" },
            new UsState { Id = 19, Name = "Maine", Abbreviation = "ME", Capital = "Augusta", Governor = "Janet Mills", SenatorOne = "Susan Collins", SenatorTwo = "Angus King", Representative = "Varies by district" },
            new UsState { Id = 20, Name = "Maryland", Abbreviation = "MD", Capital = "Annapolis", Governor = "Wes Moore", SenatorOne = "Chris Van Hollen", SenatorTwo = "Angela Alsobrooks", Representative = "Varies by district" },
            new UsState { Id = 21, Name = "Massachusetts", Abbreviation = "MA", Capital = "Boston", Governor = "Maura Healey", SenatorOne = "Elizabeth Warren", SenatorTwo = "Ed Markey", Representative = "Varies by district" },
            new UsState { Id = 22, Name = "Michigan", Abbreviation = "MI", Capital = "Lansing", Governor = "Gretchen Whitmer", SenatorOne = "Gary Peters", SenatorTwo = "Elissa Slotkin", Representative = "Varies by district" },
            new UsState { Id = 23, Name = "Minnesota", Abbreviation = "MN", Capital = "Saint Paul", Governor = "Tim Walz", SenatorOne = "Amy Klobuchar", SenatorTwo = "Tina Smith", Representative = "Varies by district" },
            new UsState { Id = 24, Name = "Mississippi", Abbreviation = "MS", Capital = "Jackson", Governor = "Tate Reeves", SenatorOne = "Roger Wicker", SenatorTwo = "Cindy Hyde-Smith", Representative = "Varies by district" },
            new UsState { Id = 25, Name = "Missouri", Abbreviation = "MO", Capital = "Jefferson City", Governor = "Mike Kehoe", SenatorOne = "Josh Hawley", SenatorTwo = "Eric Schmitt", Representative = "Varies by district" },
            new UsState { Id = 26, Name = "Montana", Abbreviation = "MT", Capital = "Helena", Governor = "Greg Gianforte", SenatorOne = "Steve Daines", SenatorTwo = "Tim Sheehy", Representative = "Ryan Zinke" },
            new UsState { Id = 27, Name = "Nebraska", Abbreviation = "NE", Capital = "Lincoln", Governor = "Jim Pillen", SenatorOne = "Deb Fischer", SenatorTwo = "Pete Ricketts", Representative = "Varies by district" },
            new UsState { Id = 28, Name = "Nevada", Abbreviation = "NV", Capital = "Carson City", Governor = "Joe Lombardo", SenatorOne = "Catherine Cortez Masto", SenatorTwo = "Jacky Rosen", Representative = "Varies by district" },
            new UsState { Id = 29, Name = "New Hampshire", Abbreviation = "NH", Capital = "Concord", Governor = "Kelly Ayotte", SenatorOne = "Jeanne Shaheen", SenatorTwo = "Maggie Hassan", Representative = "Chris Pappas" },
            new UsState { Id = 30, Name = "New Jersey", Abbreviation = "NJ", Capital = "Trenton", Governor = "Mikie Sherrill", SenatorOne = "Cory Booker", SenatorTwo = "Andy Kim", Representative = "Varies by district" },
            new UsState { Id = 31, Name = "New Mexico", Abbreviation = "NM", Capital = "Santa Fe", Governor = "Michelle Lujan Grisham", SenatorOne = "Martin Heinrich", SenatorTwo = "Ben Ray Lujan", Representative = "Varies by district" },
            new UsState { Id = 32, Name = "New York", Abbreviation = "NY", Capital = "Albany", Governor = "Kathy Hochul", SenatorOne = "Chuck Schumer", SenatorTwo = "Kirsten Gillibrand", Representative = "Varies by district" },
            new UsState { Id = 33, Name = "North Carolina", Abbreviation = "NC", Capital = "Raleigh", Governor = "Josh Stein", SenatorOne = "Thom Tillis", SenatorTwo = "Ted Budd", Representative = "Varies by district" },
            new UsState { Id = 34, Name = "North Dakota", Abbreviation = "ND", Capital = "Bismarck", Governor = "Kelly Armstrong", SenatorOne = "John Hoeven", SenatorTwo = "Kevin Cramer", Representative = "Julie Fedorchak" },
            new UsState { Id = 35, Name = "Ohio", Abbreviation = "OH", Capital = "Columbus", Governor = "Mike DeWine", SenatorOne = "Bernie Moreno", SenatorTwo = "Jon Husted", Representative = "Varies by district" },
            new UsState { Id = 36, Name = "Oklahoma", Abbreviation = "OK", Capital = "Oklahoma City", Governor = "Kevin Stitt", SenatorOne = "James Lankford", SenatorTwo = "Markwayne Mullin", Representative = "Varies by district" },
            new UsState { Id = 37, Name = "Oregon", Abbreviation = "OR", Capital = "Salem", Governor = "Tina Kotek", SenatorOne = "Ron Wyden", SenatorTwo = "Jeff Merkley", Representative = "Varies by district" },
            new UsState { Id = 38, Name = "Pennsylvania", Abbreviation = "PA", Capital = "Harrisburg", Governor = "Josh Shapiro", SenatorOne = "Dave McCormick", SenatorTwo = "John Fetterman", Representative = "Varies by district" },
            new UsState { Id = 39, Name = "Rhode Island", Abbreviation = "RI", Capital = "Providence", Governor = "Dan McKee", SenatorOne = "Jack Reed", SenatorTwo = "Sheldon Whitehouse", Representative = "Varies by district" },
            new UsState { Id = 40, Name = "South Carolina", Abbreviation = "SC", Capital = "Columbia", Governor = "Henry McMaster", SenatorOne = "Lindsey Graham", SenatorTwo = "Tim Scott", Representative = "Varies by district" },
            new UsState { Id = 41, Name = "South Dakota", Abbreviation = "SD", Capital = "Pierre", Governor = "Larry Rhoden", SenatorOne = "John Thune", SenatorTwo = "Mike Rounds", Representative = "Dusty Johnson" },
            new UsState { Id = 42, Name = "Tennessee", Abbreviation = "TN", Capital = "Nashville", Governor = "Bill Lee", SenatorOne = "Marsha Blackburn", SenatorTwo = "Bill Hagerty", Representative = "Varies by district" },
            new UsState { Id = 43, Name = "Texas", Abbreviation = "TX", Capital = "Austin", Governor = "Greg Abbott", SenatorOne = "John Cornyn", SenatorTwo = "Ted Cruz", Representative = "Varies by district" },
            new UsState { Id = 44, Name = "Utah", Abbreviation = "UT", Capital = "Salt Lake City", Governor = "Spencer Cox", SenatorOne = "Mike Lee", SenatorTwo = "John Curtis", Representative = "Varies by district" },
            new UsState { Id = 45, Name = "Vermont", Abbreviation = "VT", Capital = "Montpelier", Governor = "Phil Scott", SenatorOne = "Bernie Sanders", SenatorTwo = "Peter Welch", Representative = "Becca Balint" },
            new UsState { Id = 46, Name = "Virginia", Abbreviation = "VA", Capital = "Richmond", Governor = "Abigail Spanberger", SenatorOne = "Mark Warner", SenatorTwo = "Tim Kaine", Representative = "Varies by district" },
            new UsState { Id = 47, Name = "Washington", Abbreviation = "WA", Capital = "Olympia", Governor = "Bob Ferguson", SenatorOne = "Patty Murray", SenatorTwo = "Maria Cantwell", Representative = "Varies by district" },
            new UsState { Id = 48, Name = "West Virginia", Abbreviation = "WV", Capital = "Charleston", Governor = "Patrick Morrisey", SenatorOne = "Shelley Moore Capito", SenatorTwo = "Jim Justice", Representative = "Varies by district" },
            new UsState { Id = 49, Name = "Wisconsin", Abbreviation = "WI", Capital = "Madison", Governor = "Tony Evers", SenatorOne = "Tammy Baldwin", SenatorTwo = "Ron Johnson", Representative = "Varies by district" },
            new UsState { Id = 50, Name = "Wyoming", Abbreviation = "WY", Capital = "Cheyenne", Governor = "Mark Gordon", SenatorOne = "John Barrasso", SenatorTwo = "Cynthia Lummis", Representative = "Harriet Hageman" }
        );
    }
}
